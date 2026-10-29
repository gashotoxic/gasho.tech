import { test } from "node:test"
import assert from "node:assert/strict"

/**
 * `data/blogs.json` is read through the GitHub *contents* API, and that API stops
 * returning a file's body at 1 MB: for a 1–100 MB file it answers 200 with the
 * metadata (`sha`, `size`) and `content: ""` / `encoding: "none"`. The archive was
 * 565 KB / 73 posts when this was written, so the read was one publish season away
 * from `JSON.parse("")` — a 500 on every write path and a blog that quietly served
 * the deployed snapshot.
 *
 * These tests pin the fix and the shapes it depends on:
 *
 *   - a file past 1 MB is read in two requests, the body coming from
 *     `GET /git/blobs/{sha}` addressed by the sha the metadata read reported;
 *   - that body is refused unless it is the blob the metadata named, and unless it
 *     is the number of bytes GitHub said it was (a truncated body still decodes);
 *   - a file at 1 MB or below still takes exactly one request — the common case
 *     must not get slower;
 *   - a write over such a file still pins the sha that was read;
 *   - past the 100 MB ceiling the read fails loudly, names the remedy, and does not
 *     spend a request on a body it can never get.
 *
 * The 1.2 MB body below is real JSON of a real size, so the read is exercised at
 * the size that used to break it rather than at a convenient smaller one.
 */

process.env.GH_TOKEN = "test-token"

const CONTENTS_URL = "https://api.github.com/repos/gashotoxic/gasho.tech/contents/data/blogs.json"
const BLOBS_URL = "https://api.github.com/repos/gashotoxic/gasho.tech/git/blobs"

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
function metadataOnly(sha: string, size: number) {
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
  assert.ok(size > 1024 * 1024, `the fixture must be past 1 MB, got ${size} bytes`)

  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly("blob-sha-1", size))],
    [`${BLOBS_URL}/blob-sha-1`, () => jsonResponse(blobFor("blob-sha-1", archive))],
  ])

  try {
    const snapshot = await readBlogFile()

    assert.equal(snapshot.posts.length, 12, "every post in the archive must come back")
    assert.equal(snapshot.sha, "blob-sha-1", "the sha a write pins is the one the metadata read gave")
    assert.equal(stub.calls.length, 2, "a >1 MB read is metadata + blob")

    const [metadata, blob] = stub.calls
    assert.equal(metadata.method, "GET")
    assert.equal(metadata.url, `${CONTENTS_URL}?ref=main`)
    assert.equal(blob.method, "GET")
    assert.equal(
      blob.url,
      `${BLOBS_URL}/blob-sha-1`,
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
          sha: "small-sha",
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

test("a body that is not the version the metadata named is refused", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  const archive = bigArchive()
  const size = Buffer.byteLength(archive, "utf-8")
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly("blob-sha-1", size))],
    // Someone committed between the two reads: this blob is a newer version. The
    // write would pin blob-sha-1 while the list came from another version.
    [`${BLOBS_URL}/blob-sha-1`, () => jsonResponse(blobFor("blob-sha-2", archive))],
  ])

  try {
    await assert.rejects(readBlogFile(), /not the version data\/blogs\.json was read at/)
  } finally {
    stub.restore()
  }
})

test("a failed blob read is reported, not treated as an empty archive", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  const archive = bigArchive()
  const size = Buffer.byteLength(archive, "utf-8")
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly("blob-sha-1", size))],
    [`${BLOBS_URL}/blob-sha-1`, () => new Response("upstream down", { status: 502 })],
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
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly("blob-sha-1", size))],
    [
      `${BLOBS_URL}/blob-sha-1`,
      () => jsonResponse({ sha: "blob-sha-1", size, encoding: "none", content: "" }),
    ],
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
  // Half a post list still decodes and may even parse; only the byte count GitHub
  // reported says it is not the file.
  const truncated = archive.slice(0, Math.floor(archive.length / 2))
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly("blob-sha-1", size))],
    [`${BLOBS_URL}/blob-sha-1`, () => jsonResponse(blobFor("blob-sha-1", truncated))],
  ])

  try {
    await assert.rejects(readBlogFile(), /read as \d+ bytes but GitHub reported \d+/)
  } finally {
    stub.restore()
  }
})

test("an archive past the ceiling fails loudly, names the remedy, and spends no second request", async () => {
  const { readBlogFile, BLOG_FILE_MAX_BYTES, BlogFileTooLargeError } = await import("../lib/github.ts")
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly("huge-sha", BLOG_FILE_MAX_BYTES + 1))],
  ])

  try {
    await assert.rejects(readBlogFile(), (error: unknown) => {
      assert.ok(error instanceof BlogFileTooLargeError, "the failure must be the named one")
      assert.match(error.message, /over GitHub's 100\.0 MB ceiling/)
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
  const stub = stubFetch([
    [CONTENTS_URL, () => jsonResponse(metadataOnly("blob-sha-1", size)), "GET"],
    [`${BLOBS_URL}/blob-sha-1`, () => jsonResponse(blobFor("blob-sha-1", archive))],
    [
      CONTENTS_URL,
      () => jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } }),
      "PUT",
    ],
  ])

  try {
    const read = await readBlogFileForWrite()
    assert.equal(read.sha, "blob-sha-1")
    assert.equal(read.posts.length, 12)

    const result = await commitBlogChanges(JSON.stringify({ posts: read.posts }, null, 2), "feat(blog): publish", read.sha)
    assert.equal(result.success, true)

    const commit = stub.calls.at(-1)
    assert.equal(commit?.method, "PUT")
    assert.equal(commit?.body?.sha, "blob-sha-1", "the sha read through the blob path is the sha pinned")
    const committed = JSON.parse(
      Buffer.from(String(commit?.body?.content), "base64").toString("utf-8")
    ) as { posts: unknown[] }
    assert.equal(committed.posts.length, 12, "the committed file must hold every post")
  } finally {
    stub.restore()
  }
})

test("the archive-size warning fires once at 80% of the ceiling", async () => {
  const { readBlogFile, BLOG_FILE_WARN_BYTES } = await import("../lib/github.ts")
  // Only `size` is read on this branch; the body is irrelevant to the warning, and
  // an 80 MB fixture would be pointless weight.
  const stub = stubFetch([
    [
      CONTENTS_URL,
      () =>
        jsonResponse({
          sha: "big-sha",
          size: BLOG_FILE_WARN_BYTES,
          encoding: "base64",
          content: Buffer.from(SMALL_ARCHIVE, "utf-8").toString("base64"),
        }),
    ],
  ])

  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(" "))
  }

  try {
    await readBlogFile()
    await readBlogFile()
    assert.equal(warnings.length, 1, "a per-request warn above 80% would bury the one that matters")
    assert.match(warnings[0], /80% of the 100\.0 MB ceiling/)
  } finally {
    console.warn = originalWarn
    stub.restore()
  }
})
