// The route imports its helpers through the tsconfig `@/` alias, which the plain
// `node --test` resolver does not know about. This registers a resolve hook; it
// must be imported before the route module.
import "./support/alias-hook.mjs"

import { test, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { readFile, rename } from "node:fs/promises"
import { copyFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// The anonymous read path keeps a 30s in-process memo, which would otherwise
// make one test's stubbed archive leak into the next one. Each test starts from a
// cold cache.
//
// Imported *dynamically*: `lib/blog-read-cache.ts` pulls in `lib/github.ts`,
// which captures `process.env.GH_TOKEN` when it is evaluated, and the token below
// is only set once this module's body runs. A static import here would load
// GitHub with no token, and every read would fail before the stub is reached.
beforeEach(async () => {
  const { clearBlogReadCache } = await import("../lib/blog-read-cache.ts")
  clearBlogReadCache()
})

/**
 * Route-layer tests for `app/api/blogs/route.ts`.
 *
 * Two findings, both pre-existing on `main`:
 *
 *  1. `GET` was unauthenticated and returned every post in the file — drafts
 *     (`published: false`) and their bodies included. The public blog index and
 *     the post pages do need a public read, so the fix is a visibility filter,
 *     not a blanket 401: an anonymous caller gets published posts, an admin
 *     session gets the whole list (the admin panel edits drafts).
 *  2. `POST`/`PUT`/`DELETE` built the post list from `/tmp/blogs.json` or the
 *     build-time snapshot, fell back to `[]` when the read failed, and committed
 *     with no pinned sha — so one call could resurrect a deleted post and wipe
 *     everything published since the build. They now read the live file, merge,
 *     and commit with the sha they read.
 *
 * These drive the exported handlers against a stubbed GitHub API and assert on
 * the bytes that would be committed, so they fail if the route stops going
 * through the safe path (a `lib/blog-publish.ts` unit test cannot catch that).
 */

process.env.GH_TOKEN = "test-token"
process.env.BLOG_ADMIN_PASSWORD = "test-password"
process.env.BLOG_SESSION_SECRET = "test-session-secret-that-is-long-enough"

interface Call {
  url: string
  method: string
  body?: Record<string, unknown>
}

const BLOG_CONTENTS = "contents/data/blogs.json"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function stubFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const original = globalThis.fetch

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    }
    calls.push(call)
    return handler(call)
  }) as typeof fetch

  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

/** What the live `data/blogs.json` holds: two published posts and one draft. */
function livePosts() {
  const base = {
    excerpt: "excerpt",
    content: "body",
    author: "GashoTech",
    category: "AI",
    date: "2026-10-01",
    image: "/images/AI.webp",
    published: true,
  }

  return [
    { ...base, slug: "published-one", title: "Published One" },
    { ...base, slug: "published-two", title: "Published Two" },
    {
      ...base,
      slug: "unfinished-draft",
      title: "Unfinished Draft",
      content: "SECRET-DRAFT-BODY not for publication yet",
      published: false,
    },
  ]
}

function archivedPosts(count = 6) {
  return Array.from({ length: count }, (_, i) => ({
    slug: `archived-${i + 1}`,
    title: `Archived ${i + 1}`,
    excerpt: `Archived excerpt ${i + 1}`,
    content: `archived body ${i + 1}`,
    author: "GashoTech",
    category: "AI",
    date: "2025-01-0" + ((i % 8) + 1),
    image: `/images/archived-${i + 1}.webp`,
    published: true,
    tags: ["archive"],
    readTime: 4,
  }))
}

function blogRead(posts: unknown[], sha = "read-sha"): Response {
  // `size` is part of the contract now, on the inline path too: the contents API
  // always reports it, and the read refuses an inline body it cannot size-check
  // (a truncated list parses more often than it looks like it should).
  const body = JSON.stringify({ posts })
  return jsonResponse({
    sha,
    size: Buffer.byteLength(body, "utf-8"),
    encoding: "base64",
    content: Buffer.from(body, "utf-8").toString("base64"),
  })
}

function committedPosts(call: Call): Array<Record<string, unknown>> {
  assert.ok(call.body, "no request body was sent")
  const decoded = Buffer.from(String(call.body.content), "base64").toString("utf-8")
  const parsed = JSON.parse(decoded) as { posts?: unknown }
  assert.ok(Array.isArray(parsed.posts), "the committed file is not `{ posts: [...] }`")
  return parsed.posts as Array<Record<string, unknown>>
}

async function token(): Promise<string> {
  const { createSessionToken } = await import("../lib/auth.ts")
  const issued = createSessionToken()
  assert.ok(issued, "test session could not be issued")
  return issued
}

async function loadRoute() {
  return await import("../app/api/blogs/route.ts")
}

async function authorized(): Promise<Record<string, string>> {
  return { authorization: `Bearer ${await token()}`, "content-type": "application/json" }
}

function countWrites(calls: Call[]): number {
  return calls.filter((call) => call.method === "PUT" || call.method === "DELETE").length
}

function blogReads(calls: Call[]): Call[] {
  return calls.filter((call) => call.method === "GET" && call.url.includes(BLOG_CONTENTS))
}

/* ------------------------------------------------- snapshot fixture control ---- */

/**
 * The deployed snapshot, as a *copy* in a tmpdir.
 *
 * These helpers used to `utimes` and `rename` the tracked `data/blogs.json`: a
 * killed run left the checkout without its archive (the file was mv'd away and
 * only a `finally` put it back), and even a passing run rewrote the mtime of a
 * tracked file. `BLOG_SNAPSHOT_FILE` points the reader at this copy instead, so
 * the tests can age it, hide it and corrupt it without touching the repository.
 */
const REAL_SNAPSHOT = new URL("../data/blogs.json", import.meta.url)
const SNAPSHOT_DIR = mkdtempSync(join(tmpdir(), "gasho-blog-snapshot-"))
const SNAPSHOT_FILE = join(SNAPSHOT_DIR, "blogs.json")
copyFileSync(fileURLToPath(REAL_SNAPSHOT), SNAPSHOT_FILE)
process.env.BLOG_SNAPSHOT_FILE = SNAPSHOT_FILE

/**
 * Serve the route a deployed snapshot of a chosen age.
 *
 * The age comes from the *build stamp*, which is what a deployment has
 * (`next.config.ts` bakes `NEXT_PUBLIC_BUILD_TIME` into the bundle) and what the
 * bound is defined against. The file's mtime is only a local fallback, so a test
 * that aged the copy on disk would no longer be testing the production anchor.
 * `null` removes the stamp, which is how the "bound not applied" case is reached.
 */
async function withSnapshotAge(ageMs: number | null, run: () => Promise<void>): Promise<void> {
  const previous = process.env.NEXT_PUBLIC_BUILD_TIME
  if (ageMs === null) {
    delete process.env.NEXT_PUBLIC_BUILD_TIME
  } else {
    process.env.NEXT_PUBLIC_BUILD_TIME = new Date(Date.now() - ageMs).toISOString()
  }
  try {
    await run()
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_BUILD_TIME
    else process.env.NEXT_PUBLIC_BUILD_TIME = previous
  }
}

/** Hide the deployed snapshot, the way a deployment without one would. */
async function hideSnapshot(): Promise<{ restore: () => Promise<void> }> {
  const hidden = `${SNAPSHOT_FILE}.unavailable-test`
  await rename(SNAPSHOT_FILE, hidden)
  return {
    restore: async () => {
      await rename(hidden, SNAPSHOT_FILE)
    },
  }
}


/* ------------------------------------------------------------------ GET ---- */

test("an anonymous GET never returns a draft, or its body", async () => {
  const posts = livePosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(posts)
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { GET } = await loadRoute()
    const response = await GET(new Request("http://localhost/api/blogs"))
    assert.equal(response.status, 200)

    const body = (await response.json()) as Array<Record<string, unknown>>
    assert.equal(Array.isArray(body), true, "the public index expects a bare array")
    assert.deepEqual(
      body.map((post) => post.slug),
      ["published-one", "published-two"],
      "an unauthenticated read must return published posts only"
    )
    assert.ok(
      !JSON.stringify(body).includes("SECRET-DRAFT-BODY"),
      "the unpublished body leaked to an anonymous caller"
    )
  } finally {
    stub.restore()
  }
})

test("an authenticated GET still sees drafts, so the admin panel can edit them", async () => {
  const posts = livePosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(posts)
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { GET } = await loadRoute()
    const response = await GET(
      new Request("http://localhost/api/blogs", { headers: await authorized() })
    )

    const body = (await response.json()) as Array<Record<string, unknown>>
    assert.deepEqual(
      body.map((post) => post.slug),
      ["published-one", "published-two", "unfinished-draft"],
      "an admin must be able to list drafts"
    )
  } finally {
    stub.restore()
  }
})

/* ----------------------------------------------------------------- POST ---- */

test("POST commits the live list plus the new post, with the sha it read", async () => {
  const archived = archivedPosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { POST } = await loadRoute()
    const response = await POST(
      new Request("http://localhost/api/blogs", {
        method: "POST",
        headers: await authorized(),
        body: JSON.stringify({ title: "A Brand New Post", content: "fresh body" }),
      })
    )

    assert.equal(response.status, 201)

    const put = stub.calls.find((call) => call.method === "PUT")
    assert.ok(put, "no commit was attempted")

    // One read only: the sha comes from the read the route made, so the commit
    // does not look the file up a second time (an unpinned sha does).
    assert.equal(blogReads(stub.calls).length, 1, "the live file must be read exactly once")
    assert.equal(put.body?.sha, "read-sha", "the sha the route read must be pinned")

    const posts = committedPosts(put)
    assert.equal(posts.length, archived.length + 1, "the write dropped archived posts")
    for (const post of archived) {
      assert.ok(
        posts.some((candidate) => candidate.slug === post.slug),
        `creating a post dropped archived post ${post.slug}`
      )
    }
  } finally {
    stub.restore()
  }
})

test("POST refuses a slug that is already archived instead of overwriting it", async () => {
  const archived = archivedPosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { POST } = await loadRoute()
    const response = await POST(
      new Request("http://localhost/api/blogs", {
        method: "POST",
        headers: await authorized(),
        body: JSON.stringify({ title: archived[0].title, content: "replacement body" }),
      })
    )

    assert.equal(response.status, 409)
    assert.equal(countWrites(stub.calls), 0, "a refused create must not commit")
  } finally {
    stub.restore()
  }
})

test("POST writes nothing when the live list cannot be read", async () => {
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
      return new Response("upstream down", { status: 502 })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { POST } = await loadRoute()
    const response = await POST(
      new Request("http://localhost/api/blogs", {
        method: "POST",
        headers: await authorized(),
        body: JSON.stringify({ title: "Doomed Post", content: "body" }),
      })
    )

    assert.equal(response.status, 500)
    const payload = (await response.json()) as Record<string, unknown>
    assert.equal(payload.code, "read-failed")
    assert.equal(countWrites(stub.calls), 0, "a blind write over an unreadable list")
  } finally {
    stub.restore()
  }
})

/* ------------------------------------------------------------------ PUT ---- */

test("PUT edits one post, keeps the rest of the live list, and pins the sha", async () => {
  const archived = archivedPosts()
  const target = archived[2]
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { PUT } = await loadRoute()
    const response = await PUT(
      new Request("http://localhost/api/blogs", {
        method: "PUT",
        headers: await authorized(),
        body: JSON.stringify({ slug: target.slug, title: "Edited title", content: "edited body" }),
      })
    )

    assert.equal(response.status, 200)
    const saved = (await response.json()) as Record<string, unknown>
    assert.equal(saved.title, "Edited title")

    const put = stub.calls.find((call) => call.method === "PUT")
    assert.ok(put)
    assert.equal(put.body?.sha, "read-sha", "the sha the route read must be pinned")

    const posts = committedPosts(put)
    assert.equal(posts.length, archived.length, "an edit must not add or drop posts")
    const stored = posts.find((post) => post.slug === target.slug) as Record<string, unknown>
    assert.equal(stored.title, "Edited title")
    assert.equal(stored.content, "edited body")
    assert.equal(stored.date, target.date, "an edit must not restamp the publish date")
  } finally {
    stub.restore()
  }
})

test("PUT on a slug that is not archived is a 404 and commits nothing", async () => {
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archivedPosts())
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { PUT } = await loadRoute()
    const response = await PUT(
      new Request("http://localhost/api/blogs", {
        method: "PUT",
        headers: await authorized(),
        body: JSON.stringify({ slug: "not-a-real-post", title: "ghost" }),
      })
    )

    assert.equal(response.status, 404)
    assert.equal(countWrites(stub.calls), 0)
  } finally {
    stub.restore()
  }
})

test("a lost race is reported as a 409, not as a successful save", async () => {
  const archived = archivedPosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return new Response('{"message":"sha does not match"}', { status: 409 })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { PUT } = await loadRoute()
    const response = await PUT(
      new Request("http://localhost/api/blogs", {
        method: "PUT",
        headers: await authorized(),
        body: JSON.stringify({ slug: archived[0].slug, title: "late edit" }),
      })
    )

    assert.equal(response.status, 409)
    const payload = (await response.json()) as Record<string, unknown>
    assert.equal(payload.code, "conflict")
  } finally {
    stub.restore()
  }
})

/* --------------------------------------------------------------- DELETE ---- */

test("DELETE removes exactly one post from the live list and pins the sha", async () => {
  const archived = archivedPosts()
  const target = archived[3]
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { DELETE } = await loadRoute()
    const response = await DELETE(
      new Request(`http://localhost/api/blogs?slug=${target.slug}`, {
        method: "DELETE",
        headers: await authorized(),
      })
    )

    assert.equal(response.status, 200)
    const put = stub.calls.find((call) => call.method === "PUT")
    assert.ok(put, "no commit was attempted")
    assert.equal(put.body?.sha, "read-sha", "the sha the route read must be pinned")

    const slugs = committedPosts(put).map((post) => post.slug)
    assert.equal(slugs.length, archived.length - 1, "a delete must remove one post, not the list")
    assert.ok(!slugs.includes(target.slug), "the requested post was not removed")
    for (const post of archived.filter((candidate) => candidate.slug !== target.slug)) {
      assert.ok(slugs.includes(post.slug), `delete dropped an unrelated post ${post.slug}`)
    }
  } finally {
    stub.restore()
  }
})

test("DELETE on a slug that is not archived is a 404 and commits nothing", async () => {
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archivedPosts())
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { DELETE } = await loadRoute()
    const response = await DELETE(
      new Request("http://localhost/api/blogs?slug=not-a-real-post", {
        method: "DELETE",
        headers: await authorized(),
      })
    )

    assert.equal(response.status, 404)
    assert.equal(countWrites(stub.calls), 0)
  } finally {
    stub.restore()
  }
})

test("every write handler refuses an unauthenticated caller before touching GitHub", async () => {
  const stub = stubFetch((call) => {
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { POST, PUT, DELETE } = await loadRoute()
    const bodies = {
      POST: { title: "no auth", content: "body" },
      PUT: { slug: "archived-1", title: "no auth" },
    }

    for (const method of ["POST", "PUT"] as const) {
      const response = await (method === "POST" ? POST : PUT)(
        new Request("http://localhost/api/blogs", {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(bodies[method]),
        })
      )
      assert.equal(response.status, 401, `${method} accepted an anonymous caller`)
    }

    const deleted = await DELETE(
      new Request("http://localhost/api/blogs?slug=archived-1", { method: "DELETE" })
    )
    assert.equal(deleted.status, 401, "DELETE accepted an anonymous caller")

    assert.equal(stub.calls.length, 0, "an unauthenticated write reached GitHub")
  } finally {
    stub.restore()
  }
})

test("a 404 from the contents API is a read failure, never an empty archive", async () => {
  // `readBlogFile()` offers a missing file as `{ posts: [], missing: true }` for a
  // genuine first-ever publish. Here that would mean "the archive is empty" and
  // the next write would commit a one-post file over 73 posts, with no sha to
  // protect it. A transient 404 (bad ref, token without access, outage) must fail
  // closed instead.
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
      return new Response('{"message":"Not Found"}', { status: 404 })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { POST } = await loadRoute()
    const response = await POST(
      new Request("http://localhost/api/blogs", {
        method: "POST",
        headers: await authorized(),
        body: JSON.stringify({ title: "Would Clobber The Archive", content: "body" }),
      })
    )

    assert.equal(response.status, 500)
    const payload = (await response.json()) as Record<string, unknown>
    assert.equal(payload.code, "read-failed")
    assert.equal(countWrites(stub.calls), 0, "a 404 must not authorise a blind write")
  } finally {
    stub.restore()
  }
})

test("the GET response says how it may be cached, and varies on Authorization", async () => {
  const posts = livePosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(posts)
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { GET } = await loadRoute()

    const anonymous = await GET(new Request("http://localhost/api/blogs"))
    assert.equal(
      anonymous.headers.get("vary"),
      "Authorization",
      "a shared cache must not reuse one caller's response for another"
    )
    assert.match(
      String(anonymous.headers.get("cache-control")),
      /s-maxage/,
      "the published projection should be cacheable to survive anonymous traffic"
    )

    const admin = await GET(
      new Request("http://localhost/api/blogs", { headers: await authorized() })
    )
    assert.match(
      String(admin.headers.get("cache-control")),
      /no-store/,
      "a draft-bearing response must never be cached"
    )
  } finally {
    stub.restore()
  }
})

test("a 404 from the contents API does not blank the blog: GET falls back to the snapshot", async () => {
  // The regression this test exists for. `readBlogFile()` reports a 404 from the
  // contents API as `{ posts: [], missing: true }` — a shape meant for a genuine
  // first publish — and the read path took it at face value. The public GET then
  // answered 200 `[]` with `s-maxage=60`: the whole blog rendered "No blog posts
  // yet" and every `/blogs/<slug>` 404'd for a minute, at the same moment the
  // write path refuses to trust that very same 404.
  //
  // The snapshot's age is pinned here: the fallback is only served while the
  // build-time copy is younger than the bound, and a checkout's mtime is not
  // something a test should depend on.
  await withSnapshotAge(0, async () => {
    const stub = stubFetch((call) => {
      if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
        return new Response('{"message":"Not Found"}', { status: 404 })
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
    })

    try {
      const { GET } = await loadRoute()
      const response = await GET(new Request("http://localhost/api/blogs"))
      assert.equal(response.status, 200)

      const body = (await response.json()) as Array<Record<string, unknown>>
      assert.ok(
        Array.isArray(body) && body.length > 0,
        "a 404 must not be served as an empty blog"
      )

      // …and what it falls back to is the deployed snapshot, published only.
      const snapshotRaw = await readFile(new URL("../data/blogs.json", import.meta.url), "utf-8")
      const snapshot = (JSON.parse(snapshotRaw) as { posts: Array<Record<string, unknown>> }).posts
      const expected = snapshot.filter((post) => post.published === true).map((post) => post.slug)

      assert.deepEqual(
        body.map((post) => post.slug),
        expected,
        "the fallback must be the build-time archive, not nothing"
      )
      assert.ok(
        body.every((post) => post.published === true),
        "the snapshot fallback must still be projected for an anonymous caller"
      )
    } finally {
      stub.restore()
    }
  })
})

test("a live read is marked as live, so the fallback can be told apart from it", async () => {
  const posts = livePosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(posts)
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { GET } = await loadRoute()
    const response = await GET(new Request("http://localhost/api/blogs"))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("x-blog-source"), "live")
  } finally {
    stub.restore()
  }
})

test("a snapshot fallback says so on the response, with its age", async () => {
  // The fallback used to be a `console.warn` and nothing else: a deployment whose
  // archive could not be read served the build-time list with every monitoring
  // check green. The header is the alertable signal.
  await withSnapshotAge(5 * 60_000, async () => {
    const stub = stubFetch((call) => {
      if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
        return new Response('{"message":"upstream down"}', { status: 500 })
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
    })

    try {
      const { GET } = await loadRoute()
      const response = await GET(new Request("http://localhost/api/blogs"))
      assert.equal(response.status, 200)
      assert.equal(response.headers.get("x-blog-source"), "snapshot")

      const age = Number(response.headers.get("x-blog-snapshot-age"))
      assert.ok(Number.isFinite(age), "the snapshot age must be reported in seconds")
      assert.ok(age >= 4 * 60 && age <= 10 * 60, `unexpected snapshot age: ${age}s`)
    } finally {
      stub.restore()
    }
  })
})

test("a snapshot past its maximum age is refused: 503 with no-store, not a stale blog", async () => {
  const { GET } = await loadRoute()
  const { MAX_SNAPSHOT_AGE_MS } = await import("../lib/blog-snapshot.ts")
  assert.ok(MAX_SNAPSHOT_AGE_MS > 0, "the snapshot bound must be enforced, not disabled")

  // "Serve the build-time list forever" is the bug. Past the bound the archive is
  // missing everything published since that build, so the honest answer is 503.
  await withSnapshotAge(MAX_SNAPSHOT_AGE_MS + 60 * 60_000, async () => {
    const stub = stubFetch((call) => {
      if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
        return new Response('{"message":"Not Found"}', { status: 404 })
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
    })

    try {
      const response = await GET(new Request("http://localhost/api/blogs"))
      assert.equal(response.status, 503, "an over-age snapshot must not be served as the blog")
      assert.match(String(response.headers.get("cache-control")), /no-store/)
      assert.equal(response.headers.get("x-blog-source"), "none")

      const payload = (await response.json()) as Record<string, unknown>
      assert.equal(payload.code, "read-failed")
    } finally {
      stub.restore()
    }
  })
})

test("the 24–48 h band is served but marked, so the 48 h cliff is not a surprise", async () => {
  const { SNAPSHOT_WARN_AGE_MS, MAX_SNAPSHOT_AGE_MS } = await import("../lib/blog-snapshot.ts")
  assert.ok(SNAPSHOT_WARN_AGE_MS < MAX_SNAPSHOT_AGE_MS, "the warning has to arrive before the refusal")

  // A deployment 30 h old is still a better answer than a 503 — every post published
  // since it was built is missing, but the blog works — provided something says so.
  await withSnapshotAge(30 * 60 * 60_000, async () => {
    const stub = stubFetch((call) => {
      if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
        return new Response('{"message":"upstream down"}', { status: 500 })
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
    })

    try {
      const { GET } = await loadRoute()
      const response = await GET(new Request("http://localhost/api/blogs"))
      assert.equal(response.status, 200, "the stale band is still served")
      assert.equal(response.headers.get("x-blog-source"), "snapshot")
      assert.equal(
        response.headers.get("x-blog-snapshot-stale"),
        "1",
        "the stale marker is the alertable signal for the 24–48 h band"
      )
      const age = Number(response.headers.get("x-blog-snapshot-age"))
      assert.ok(age >= 29 * 3600 && age <= 31 * 3600, `unexpected snapshot age: ${age}s`)
    } finally {
      stub.restore()
    }
  })
})

test("a snapshot with no build stamp falls back to the file's mtime, and says which anchor it used", async () => {
  // The anchor is `NEXT_PUBLIC_BUILD_TIME`; without one (a local `next start`, a
  // bare `node`) the age comes from the file's mtime — which can lie about a
  // warm-workspace copy, so the response names the anchor it used rather than
  // implying the age is measured from a build.
  await withSnapshotAge(null, async () => {
    const stub = stubFetch((call) => {
      if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
        return new Response('{"message":"upstream down"}', { status: 500 })
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
    })

    try {
      const { GET } = await loadRoute()
      const response = await GET(new Request("http://localhost/api/blogs"))
      assert.equal(response.status, 200)
      assert.equal(response.headers.get("x-blog-source"), "snapshot")
      assert.equal(
        response.headers.get("x-blog-snapshot-anchor"),
        "mtime",
        "without a build stamp the age is an mtime age, and the header has to say so"
      )
      assert.equal(response.headers.get("x-blog-snapshot-stale"), null)
    } finally {
      stub.restore()
    }
  })
})

test("a stamped snapshot reports the build as its anchor", async () => {
  await withSnapshotAge(5 * 60_000, async () => {
    const stub = stubFetch((call) => {
      if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
        return new Response('{"message":"upstream down"}', { status: 500 })
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
    })

    try {
      const { GET } = await loadRoute()
      const response = await GET(new Request("http://localhost/api/blogs"))
      assert.equal(response.status, 200)
      assert.equal(response.headers.get("x-blog-snapshot-anchor"), "build")
    } finally {
      stub.restore()
    }
  })
})

test("no live archive and no snapshot is a 503, never an empty blog", async () => {
  // The `readPostsForRead` → `null` branch: nothing honest to serve. Answering 200
  // `[]` here renders "No blog posts yet" and 404s every post page, which is the
  // symptom the whole fallback exists to avoid.
  const hidden = await hideSnapshot()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
      return new Response('{"message":"Not Found"}', { status: 404 })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { GET } = await loadRoute()
    const response = await GET(new Request("http://localhost/api/blogs"))

    assert.equal(response.status, 503)
    assert.match(String(response.headers.get("cache-control")), /no-store/)
    assert.equal(response.headers.get("x-blog-source"), "none")

    const payload = (await response.json()) as Record<string, unknown>
    assert.match(String(payload.error), /not an empty blog/)
  } finally {
    stub.restore()
    await hidden.restore()
  }
})

test("a persistent 404 costs one authenticated read per negative TTL, not one per render", async () => {
  // The memo never cached `missing`, so every anonymous render of a broken archive
  // spent an authenticated contents call — the 5,000/hour burn the memo exists to
  // stop, in the one case it did not cover.
  await withSnapshotAge(0, async () => {
    let reads = 0
    const stub = stubFetch((call) => {
      if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
        reads += 1
        return new Response('{"message":"Not Found"}', { status: 404 })
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
    })

    try {
      const { GET } = await loadRoute()
      for (let i = 0; i < 3; i += 1) {
        const response = await GET(new Request("http://localhost/api/blogs"))
        assert.equal(response.status, 200)
      }
      assert.equal(
        reads,
        1,
        "a missing archive must be remembered for the negative TTL, not re-probed every render"
      )
    } finally {
      stub.restore()
    }
  })
})

test("a failing upstream costs one authenticated read per failure TTL, not one per render", async () => {
  // The same burn as the 404, one level worse: a thrown read was never memoised
  // either, so during a GitHub outage every anonymous render (two per post page)
  // spent an authenticated contents call chasing an upstream that was already
  // failing — enough traffic and the shared token budget is gone, which also stops
  // publishing.
  await withSnapshotAge(0, async () => {
    let reads = 0
    const stub = stubFetch((call) => {
      if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
        reads += 1
        return new Response('{"message":"upstream down"}', { status: 502 })
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
    })

    try {
      const { GET } = await loadRoute()
      for (let i = 0; i < 3; i += 1) {
        const response = await GET(new Request("http://localhost/api/blogs"))
        // Still a failure, still the snapshot fallback — the memo only bounds the
        // cost, it does not turn a broken read into a served list.
        assert.equal(response.status, 200)
        assert.equal(response.headers.get("x-blog-source"), "snapshot")
      }
      assert.equal(reads, 1, "a failing read must be remembered for the failure TTL")
    } finally {
      stub.restore()
    }
  })
})

test("an invalid Authorization header is a 401, not the anonymous list", async () => {
  // GET used to answer 200 with the published projection for any header that did
  // not verify. That made the admin panel's `reload.status === 401` branch dead
  // code: an expired session got a list with every draft silently missing and no
  // "sign in again".
  const stub = stubFetch((call) => {
    throw new Error(`an unauthenticated read must not reach GitHub: ${call.method} ${call.url}`)
  })

  try {
    const { GET } = await loadRoute()

    for (const authorization of [
      "Bearer not-a-token",
      "Bearer v1.eyJ2IjoidjEifQ.signature",
      "Bearer ",
      "Basic YWRtaW46cGFzcw==",
      "bearer lowercase-scheme",
    ]) {
      const response = await GET(new Request("http://localhost/api/blogs", { headers: { authorization } }))
      assert.equal(response.status, 401, `${authorization} was treated as anonymous`)
      const payload = (await response.json()) as Record<string, unknown>
      assert.equal(payload.code, "invalid-token")
      assert.match(String(response.headers.get("cache-control")), /no-store/)
    }

    // No rejected session may cost a GitHub read.
    assert.equal(stub.calls.length, 0, "no rejected session may cost a GitHub read")

    // No header at all is still an anonymous read, not a failure. (The live read
    // fails here on purpose — the stub throws — so this also proves the snapshot
    // fallback answers a request instead of erroring.)
    await withSnapshotAge(0, async () => {
      const anonymous = await GET(new Request("http://localhost/api/blogs"))
      assert.equal(anonymous.status, 200, "a missing header must stay an anonymous read")
      assert.equal(anonymous.headers.get("x-blog-source"), "snapshot")
    })
  } finally {
    stub.restore()
  }
})

test("a write in the process drops the anonymous read memo", async () => {
  const posts = livePosts()
  let reads = 0
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
      reads += 1
      return blogRead(posts)
    }
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { GET, POST } = await loadRoute()

    await GET(new Request("http://localhost/api/blogs"))
    assert.equal(reads, 1, "the first anonymous read fills the memo")

    const created = await POST(
      new Request("http://localhost/api/blogs", {
        method: "POST",
        headers: await authorized(),
        body: JSON.stringify({ title: "Published Right Now", content: "fresh body" }),
      })
    )
    assert.equal(created.status, 201)

    // The next anonymous read must go back to the repository: a post published a
    // moment ago must not wait out the memo's TTL.
    await GET(new Request("http://localhost/api/blogs"))
    assert.equal(reads, 3, "the write must have dropped the memo (1 read + 1 write read + 1 refresh)")
  } finally {
    stub.restore()
  }
})

test("anonymous renders reuse a short memo; the admin list never does", async () => {
  const posts = livePosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(posts)
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { GET } = await loadRoute()

    const first = await GET(new Request("http://localhost/api/blogs"))
    const second = await GET(new Request("http://localhost/api/blogs"))
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(
      blogReads(stub.calls).length,
      1,
      "a burst of anonymous renders must not cost one token-bearing read each"
    )

    // An admin reload follows a save and must see the file as it is now.
    const admin = await GET(
      new Request("http://localhost/api/blogs", { headers: await authorized() })
    )
    assert.equal(admin.status, 200)
    assert.equal(blogReads(stub.calls).length, 2, "the admin read must bypass the memo")
  } finally {
    stub.restore()
  }
})
