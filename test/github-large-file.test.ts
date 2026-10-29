import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"

/**
 * `data/blogs.json` is read through the GitHub *contents* API, and that API stops
 * returning a file's body at 1 MB: for a 1–100 MB file it answers 200 with the
 * metadata (`sha`, `size`) and `content: ""` / `encoding: "none"`. The archive was
 * 565 KB / 73 posts when this was written, so the read was one publishing season
 * away from `JSON.parse("")` — a 500 on every write path and a blog that quietly
 * served the deployed snapshot.
 *
 * These tests pin the fix and the shapes it depends on:
 *
 *   - a file past 1 MB is read in two requests, the body coming from
 *     `GET /git/blobs/{sha}` addressed by the sha the metadata read reported;
 *   - the body must be *that* blob: the sha field must match, the byte count must
 *     match, and the content must hash to the sha it was read at (a body that only
 *     echoes the requested sha is not enough — a corrupt list returned with the real
 *     sha would be written straight back over the archive);
 *   - the sha is validated before it reaches the URL, and a metadata read without a
 *     size fails closed rather than pulling an unbounded body;
 *   - a file at 1 MB or below still takes exactly one request — the common case must
 *     not get slower;
 *   - a write over such a file still pins the sha that was read;
 *   - past the 100 MB ceiling the read fails loudly, names the remedy, and does not
 *     spend a request on a body it can never get.
 *
 * The 1.3 MB fixture below is real JSON of a real size, so the read is exercised at
 * the size that used to break it rather than at a convenient smaller one.
 */

process.env.GH_TOKEN = "test-token"

const CONTENTS_URL = "https://api.github.com/repos/gashotoxic/gasho.tech/contents/data/blogs.json"
const BLOBS_URL = "https://api.github.com/repos/gashotoxic/gasho.tech/git/blobs"

/** The git blob id — what the contents API reports as a file's `sha`. */
function gitBlobSha(body: string): string {
  const bytes = Buffer.from(body, "utf-8")
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, "utf-8"), bytes]))
    .digest("hex")
}

/** ~1.3 MB of JSON — past the contents-API body ceiling, under the hard one. */
function bigArchive(): string {
  const posts = Array.from({ length: 12 }, (_, i) => ({
    slug: `archived-${i + 1}`,
    title: `Archived ${i + 1}`,
    content: "lorem ipsum ".repeat(9000),
  }))
  return JSON.stringify({ posts }, null, 2)
}

const SMALL_ARCHIVE = JSON.stringify({ posts: [{ slug: "one", title: "One" }] }, null, 2)

interface Recorded {
  url: string
  method: string
  body?: Record<string, unknown>
}

type Route = [matcher: string, handler: () => Response, method?: string]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function stubFetch(routes: Route[]) {
  const calls: Recorded[] = []
  const original = globalThis.fetch

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
    calls.push({ url, method, body })

    // A method-specific route wins over an unqualified one for the same URL: the
    // read and the write both target the contents API.
    const match =
      routes.find(([matcher, , routeMethod]) => url.includes(matcher) && routeMethod === method) ??
      routes.find(([matcher, , routeMethod]) => url.includes(matcher) && !routeMethod)
    if (!match) throw new Error(`unexpected fetch: ${method} ${url}`)
    return match[1]()
  }) as typeof fetch

  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

/** What the contents API answers for a 1–100 MB file: metadata, no body. */
function metadataOnly(sha: string, size?: number) {
  return { name: "blogs.json", path: "data/blogs.json", sha, size, encoding: "none", content: "", type: "file" }
}

function blobFor(sha: string, body: string) {
  return {
    sha,
    size: Buffer.byteLength(body, "utf-8"),
    encoding: "base64",
    content: Buffer.from(body, "utf-8").toString("base64"),
  }
}

test("a file past the contents-API 1 MB ceiling is read through the Git blob API", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  const archive = bigArchive()
  const size = Buffer.byteLength(archive, "utf-8")
  const sha = gitBlobSha(archive)
  assert.ok(size > 1024 * 1024, `the fixture must be past 1 MB, got ${size} bytes`)

  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly(sha, size))],
    [`${BLOBS_URL}/${sha}`, () => jsonResponse(blobFor(sha, archive))],
  ])

  try {
    const snapshot = await readBlogFile()

    assert.equal(snapshot.posts.length, 12, "every post in the archive must come back")
    assert.equal(snapshot.sha, sha, "the sha a write pins is the one the metadata read gave")
    assert.equal(stub.calls.length, 2, "a >1 MB read is metadata + blob")

    const [metadata, blob] = stub.calls
    assert.equal(metadata.method, "GET")
    assert.equal(metadata.url, `${CONTENTS_URL}?ref=main`)
    assert.equal(blob.method, "GET")
    assert.equal(
      blob.url,
      `${BLOBS_URL}/${sha}`,
      "the body must be addressed by the sha the metadata read reported"
    )
  } finally {
    stub.restore()
  }
})

test("a file at or below 1 MB is still a single request", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  const size = Buffer.byteLength(SMALL_ARCHIVE, "utf-8")
  const stub = stubFetch([
    [
      CONTENTS_URL,
      () =>
        jsonResponse({
          sha: gitBlobSha(SMALL_ARCHIVE),
          size,
          encoding: "base64",
          content: Buffer.from(SMALL_ARCHIVE, "utf-8").toString("base64"),
        }),
    ],
  ])

  try {
    const snapshot = await readBlogFile()

    assert.deepEqual(
      snapshot.posts,
      [{ slug: "one", title: "One" }],
      "the inline body is the normal path and must still work"
    )
    assert.equal(stub.calls.length, 1, "the common case must not grow a second request")
  } finally {
    stub.restore()
  }
})

test("a blob that names a different version is refused", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  const archive = bigArchive()
  const size = Buffer.byteLength(archive, "utf-8")
  const readSha = gitBlobSha(archive)
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly(readSha, size))],
    // Someone committed between the two reads: this blob is a newer version. The
    // write would pin readSha while the list came from another version.
    [`${BLOBS_URL}/${readSha}`, () => jsonResponse(blobFor(gitBlobSha(`${archive} `), archive))],
  ])

  try {
    await assert.rejects(readBlogFile(), /not the version data\/blogs\.json was read at/)
  } finally {
    stub.restore()
  }
})

test("a body that does not hash to the sha it was read at is refused", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  const archive = bigArchive()
  const size = Buffer.byteLength(archive, "utf-8")
  const sha = gitBlobSha(archive)
  // Same length, same sha field, different bytes: only recomputing the blob hash
  // catches this, and a corrupt post list returned with the real sha is a list the
  // next write would commit over the archive.
  const tampered = archive.replace("lorem ipsum", "LOREM IPSUM")
  assert.equal(Buffer.byteLength(tampered, "utf-8"), size, "the tamper must keep the byte length")

  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly(sha, size))],
    [`${BLOBS_URL}/${sha}`, () => jsonResponse(blobFor(sha, tampered))],
  ])

  try {
    await assert.rejects(readBlogFile(), /does not hash to the sha it was read at/)
  } finally {
    stub.restore()
  }
})

test("a failed blob read is reported, not treated as an empty archive", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  const archive = bigArchive()
  const size = Buffer.byteLength(archive, "utf-8")
  const sha = gitBlobSha(archive)
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly(sha, size))],
    [`${BLOBS_URL}/${sha}`, () => new Response("upstream down", { status: 502 })],
  ])

  try {
    await assert.rejects(readBlogFile(), /blob read failed: 502/)
  } finally {
    stub.restore()
  }
})

test("a blob with no body is refused", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  const archive = bigArchive()
  const size = Buffer.byteLength(archive, "utf-8")
  const sha = gitBlobSha(archive)
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly(sha, size))],
    [`${BLOBS_URL}/${sha}`, () => jsonResponse({ sha, size, encoding: "none", content: "" })],
  ])

  try {
    await assert.rejects(readBlogFile(), /no body for data\/blogs\.json/)
  } finally {
    stub.restore()
  }
})

test("a truncated body is refused instead of being parsed", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  const archive = bigArchive()
  const size = Buffer.byteLength(archive, "utf-8")
  const sha = gitBlobSha(archive)
  // Half a post list still decodes and may even parse; only the byte count GitHub
  // reported says it is not the file.
  const truncated = archive.slice(0, Math.floor(archive.length / 2))
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly(sha, size))],
    [`${BLOBS_URL}/${sha}`, () => jsonResponse(blobFor(sha, truncated))],
  ])

  try {
    await assert.rejects(readBlogFile(), /read as \d+ bytes but GitHub reported \d+/)
  } finally {
    stub.restore()
  }
})

test("a malformed blob sha never reaches the URL", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  // A sha that is really a path/query on the authenticated API: `x/../../rate_limit`
  // or `x?per_page=1` would steer a request that carries the token.
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly("x/../../rate_limit", 1_300_000))],
  ])

  try {
    await assert.rejects(readBlogFile(), /malformed blob sha/)
    assert.equal(stub.calls.length, 1, "nothing is fetched with a sha that is not a sha")
  } finally {
    stub.restore()
  }
})

test("metadata without a size fails closed instead of fetching an unbounded body", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  const archive = bigArchive()
  const sha = gitBlobSha(archive)
  const stub = stubFetch([[CONTENTS_URL, () => jsonResponse(metadataOnly(sha))]])

  try {
    await assert.rejects(readBlogFile(), /read without a size/)
    assert.equal(stub.calls.length, 1, "no body is fetched when GitHub reported no ceiling to hold it to")
  } finally {
    stub.restore()
  }
})

test("an archive past the ceiling fails loudly, names the remedy, and spends no second request", async () => {
  const { readBlogFile, BLOG_FILE_MAX_BYTES, BlogFileTooLargeError } = await import("../lib/github.ts")
  const sha = gitBlobSha(bigArchive())
  const stub = stubFetch([[CONTENTS_URL, () => jsonResponse(metadataOnly(sha, BLOG_FILE_MAX_BYTES + 1))]])

  try {
    await assert.rejects(readBlogFile(), (error: unknown) => {
      assert.ok(error instanceof BlogFileTooLargeError, "the failure must be the named one")
      assert.match(error.message, /over this app's 20\.0 MB ceiling/)
      assert.match(error.message, /data\/blogs\/<slug>\.json/, "the message must name the remedy")
      return true
    })
    assert.equal(stub.calls.length, 1, "no body is fetched for a file GitHub will never serve")
  } finally {
    stub.restore()
  }
})

test("a write over 1 MB still pins the sha the read reported", async () => {
  const { readBlogFileForWrite, commitBlogChanges } = await import("../lib/github.ts")
  const archive = bigArchive()
  const size = Buffer.byteLength(archive, "utf-8")
  const sha = gitBlobSha(archive)
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly(sha, size)), "GET"],
    [`${BLOBS_URL}/${sha}`, () => jsonResponse(blobFor(sha, archive))],
    [
      CONTENTS_URL,
      () => jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } }),
      "PUT",
    ],
  ])

  try {
    const read = await readBlogFileForWrite()
    assert.equal(read.sha, sha)
    assert.equal(read.posts.length, 12)

    const result = await commitBlogChanges(JSON.stringify({ posts: read.posts }, null, 2), "feat(blog): publish", read.sha)
    assert.equal(result.success, true)

    const commit = stub.calls.at(-1)
    assert.equal(commit?.method, "PUT")
    assert.equal(commit?.body?.sha, sha, "the sha read through the blob path is the sha pinned")
    const committed = JSON.parse(
      Buffer.from(String(commit?.body?.content), "base64").toString("utf-8")
    ) as { posts: unknown[] }
    assert.equal(committed.posts.length, 12, "the committed file must hold every post")
  } finally {
    stub.restore()
  }
})

/* ------------------------------------------------------- size-edge warnings ---- */

/** Report `size` on the contents response while sending a body of another size. */
function misreportedInline(size: number) {
  return () =>
    jsonResponse({
      sha: gitBlobSha(SMALL_ARCHIVE),
      size,
      encoding: "base64",
      content: Buffer.from(SMALL_ARCHIVE, "utf-8").toString("base64"),
    })
}

/**
 * The warning is module-level state, so it is only assertable through the
 * exported reset — without one, the first suite to trip it silences every later
 * suite, and a test that passes depends on file order.
 */
test("the two-request edge warns once per process, and the reset clears it", async () => {
  const { readBlogFile, resetArchiveSizeWarnings, BLOG_FILE_WARN_BYTES } = await import(
    "../lib/github.ts"
  )
  resetArchiveSizeWarnings()
  // The reported size is what the threshold reads; the body is deliberately not
  // that size, so the size check refuses it and nothing is parsed.
  const stub = stubFetch([[CONTENTS_URL, misreportedInline(BLOG_FILE_WARN_BYTES)]])

  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(" "))
  }

  try {
    await assert.rejects(readBlogFile(), /read as \d+ bytes but GitHub reported 2097152/)
    await assert.rejects(readBlogFile())
    assert.equal(warnings.length, 1, "a per-request warn would bury the one that carries the signal")
    assert.match(warnings[0], /past GitHub's 1\.0 MB inline ceiling/)
    assert.match(warnings[0], /two\s+requests/)

    resetArchiveSizeWarnings()
    await assert.rejects(readBlogFile())
    assert.equal(warnings.length, 2, "the exported reset has to re-arm the warning")
  } finally {
    console.warn = originalWarn
    stub.restore()
    resetArchiveSizeWarnings()
  }
})

test("the ceiling edge has its own warning, and both fire on a huge archive", async () => {
  const { readBlogFile, resetArchiveSizeWarnings, BLOG_FILE_CEILING_WARN_BYTES } = await import(
    "../lib/github.ts"
  )
  resetArchiveSizeWarnings()
  const stub = stubFetch([[CONTENTS_URL, misreportedInline(BLOG_FILE_CEILING_WARN_BYTES)]])

  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(" "))
  }

  try {
    await assert.rejects(readBlogFile())
    assert.equal(warnings.length, 2, "80% of the ceiling is past both edges")
    assert.equal(
      warnings.filter((line) => line.includes("of the 20.0 MB ceiling")).length,
      1,
      "the ceiling edge names the read ceiling, not the inline one"
    )
    assert.equal(
      warnings.filter((line) => line.includes("inline ceiling")).length,
      1,
      "the two-request edge is reported separately"
    )
  } finally {
    console.warn = originalWarn
    stub.restore()
    resetArchiveSizeWarnings()
  }
})

/* ------------------------------------------------------- named failure modes ---- */

test("a 0-byte archive is named as an empty file, not as a missing GitHub body", async () => {
  const { readBlogFile, BlogFileEmptyError } = await import("../lib/github.ts")
  const emptySha = gitBlobSha("")
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly(emptySha, 0))],
  ])

  try {
    await assert.rejects(readBlogFile(), (error: unknown) => {
      assert.ok(error instanceof BlogFileEmptyError, "an empty file is its own condition")
      assert.match(error.message, /empty \(0 bytes\)/)
      return true
    })
    assert.equal(stub.calls.length, 1, "an empty file is not worth a second request")
  } finally {
    stub.restore()
  }
})

test("an inline body with no reported size is refused like the blob branch", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  const stub = stubFetch([
    [
      CONTENTS_URL,
      () =>
        jsonResponse({
          sha: gitBlobSha(SMALL_ARCHIVE),
          encoding: "base64",
          content: Buffer.from(SMALL_ARCHIVE, "utf-8").toString("base64"),
        }),
    ],
  ])

  try {
    await assert.rejects(readBlogFile(), /read from the inline body without a reported size/)
  } finally {
    stub.restore()
  }
})

test("a blob fetch that runs out of budget is a named failure, not a bare abort", async () => {
  const { readBlogFile, BlogFileFetchTimeoutError, blobFetchBudgetMs } = await import(
    "../lib/github.ts"
  )
  const archive = bigArchive()
  const size = Buffer.byteLength(archive, "utf-8")
  const sha = gitBlobSha(archive)
  // What `AbortSignal.timeout` produces in Node, raised from the stub: the read
  // has to translate it, because every caller treats an unknown error as a
  // transient outage and falls back to the snapshot.
  const timingOut = () => {
    throw Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    })
  }
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly(sha, size))],
    [`${BLOBS_URL}/${sha}`, timingOut],
  ])

  try {
    await assert.rejects(readBlogFile(), (error: unknown) => {
      assert.ok(error instanceof BlogFileFetchTimeoutError, "the failure must be the named one")
      assert.match(error.message, /did not finish downloading within \d+s/)
      assert.match(error.message, /data\/blogs\/<slug>\.json/, "the message must name the remedy")
      return true
    })
    // The budget the fetch was given must be the one it reports.
    assert.ok(blobFetchBudgetMs(size) > 8000, "a >1 MB body gets more than the flat 8 s")
  } finally {
    stub.restore()
  }
})

test("the blob budget scales with the file and is capped", async () => {
  const { blobFetchBudgetMs } = await import("../lib/github.ts")
  // A flat 8 s is what made a >10 MB read abort before the guard could fire.
  assert.equal(blobFetchBudgetMs(2 * 1024 * 1024), 8000 + 2000, "2 MB adds its own transfer time")
  assert.equal(blobFetchBudgetMs(20 * 1024 * 1024), 8000 + 20_000, "20 MB gets ~28 s")
  assert.equal(blobFetchBudgetMs(200 * 1024 * 1024), 30_000, "the cap holds for anything huge")
  assert.equal(blobFetchBudgetMs(0), 8000, "a missing size falls back to the flat bound")
})

