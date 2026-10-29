// The route imports its helpers through the tsconfig `@/` alias, which the plain
// `node --test` resolver does not know about. This registers a resolve hook; it
// must be imported before the route module.
import "./support/alias-hook.mjs"

import { test } from "node:test"
import assert from "node:assert/strict"

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
  return jsonResponse({
    sha,
    encoding: "base64",
    content: Buffer.from(JSON.stringify({ posts }), "utf-8").toString("base64"),
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
