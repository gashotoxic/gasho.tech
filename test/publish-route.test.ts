// The route imports its helpers through the tsconfig `@/` alias, which the plain
// `node --test` resolver does not know about. This registers a resolve hook; it
// must be imported before the route module.
import "./support/alias-hook.mjs"

import { test } from "node:test"
import assert from "node:assert/strict"

/**
 * Route-layer regression tests for `POST /api/studio/publish`.
 *
 * `lib/blog-publish.ts` is unit-tested against a fake store, and
 * `test/github-commit.test.ts` asserts the payload it builds by hand — so neither
 * of them can catch the route itself reverting to `{ posts: [thisPost] }`, which
 * is exactly the shape that wiped the archive (review R2, finding: "no test
 * exercises the route's read → merge → write wiring").
 *
 * These drive the exported POST handler with a stubbed GitHub API and assert on
 * the bytes that would be committed.
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
const IMAGE_CONTENTS = "contents/public/images/blog/"

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

/** The 73 archived posts `data/blogs.json` holds, trimmed to what matters here. */
function archivedPosts() {
  const archived = Array.from({ length: 72 }, (_, i) => ({
    slug: `archived-${i + 1}`,
    title: `Archived ${i + 1}`,
    excerpt: `Archived excerpt ${i + 1}`,
    content: "archived body",
    author: "GashoTech",
    category: "AI",
    date: "2025-01-0" + ((i % 8) + 1),
    image: `/images/archived-${i + 1}.webp`,
    published: true,
    tags: ["archive"],
    readTime: 4,
  }))

  return [
    {
      slug: "kenya-ai-policy-recap",
      title: "Kenya AI Policy Recap",
      excerpt: "A hand-written excerpt that must survive a re-publish.",
      content: "original body",
      author: "GashoTech",
      category: "Policy",
      date: "2025-02-14",
      image: "/images/kenya-ai-policy-recap.webp",
      published: true,
      tags: ["policy", "kenya"],
      readTime: 7,
    },
    ...archived,
  ]
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

async function publishRequest(body: Record<string, unknown>) {
  const { createSessionToken } = await import("../lib/auth.ts")
  const token = createSessionToken()
  assert.ok(token, "test session could not be issued")

  const { POST } = await import("../app/api/studio/publish/route.ts")
  const response = await POST(
    new Request("http://localhost/api/studio/publish", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  )

  return { response, payload: await response.json() as Record<string, unknown> }
}

test("publishing through the route commits the FULL list, never a single post", async () => {
  const archived = archivedPosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response, payload } = await publishRequest({
      title: "A Brand New Post",
      excerpt: "fresh excerpt",
      content: "fresh body",
      category: "Automation",
      author: "GashoTech",
      published: true,
    })

    assert.equal(response.status, 200)
    assert.equal(payload.created, true)

    const put = stub.calls.find((call) => call.method === "PUT")
    assert.ok(put, "no commit was attempted")
    assert.equal(put.body?.sha, "read-sha", "the sha the route read must be pinned")

    const posts = committedPosts(put)
    assert.equal(
      posts.length,
      archived.length + 1,
      "the committed file must hold every archived post plus the new one"
    )
    for (const post of archived) {
      assert.ok(
        posts.some((candidate) => candidate.slug === post.slug),
        `publishing dropped archived post ${post.slug}`
      )
    }
  } finally {
    stub.restore()
  }
})

test("re-publishing an archived slug keeps its date, hero image and byline", async () => {
  const archived = archivedPosts()
  const target = archived[0]
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    // The studio sends the title and body it generated; it has no excerpt,
    // author or category editor, so those are absent here on purpose.
    const { response, payload } = await publishRequest({
      title: target.title,
      content: "rewritten body",
      published: true,
    })

    assert.equal(response.status, 200)
    assert.equal(payload.created, false, "an existing slug must be reported as a replace")
    assert.equal(payload.slug, target.slug)

    const put = stub.calls.find((call) => call.method === "PUT")
    assert.ok(put)
    const posts = committedPosts(put)

    assert.equal(posts.length, archived.length, "a re-publish must not add a post")
    const [stored] = posts as unknown as Array<Record<string, unknown>>

    assert.equal(stored.slug, target.slug, "the archive order must be preserved")
    assert.equal(stored.content, "rewritten body", "the body must be the new one")
    assert.equal(stored.date, target.date, "re-publishing reset the publish date")
    assert.equal(stored.image, target.image, "re-publishing reset the hero image")
    assert.equal(stored.excerpt, target.excerpt, "re-publishing blanked the excerpt")
    assert.equal(stored.author, target.author, "re-publishing blanked the author")
    assert.equal(stored.category, target.category, "re-publishing blanked the category")
    assert.deepEqual(stored.tags, target.tags, "re-publishing blanked the tags")
    assert.equal(stored.readTime, target.readTime, "re-publishing blanked the read time")
    assert.match(String(put.body?.message), /update/, "a replace must say so in the commit")
  } finally {
    stub.restore()
  }
})

test("an explicit hero image on a re-publish does replace the archived one", async () => {
  const archived = archivedPosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response } = await publishRequest({
      title: archived[0].title,
      content: "rewritten body",
      imagePath: "/images/blog/kenya-ai-policy-recap-2026.webp",
      published: true,
    })

    assert.equal(response.status, 200)
    const posts = committedPosts(stub.calls.find((call) => call.method === "PUT")!)
    assert.equal(
      (posts[0] as unknown as Record<string, unknown>).image,
      "/images/blog/kenya-ai-policy-recap-2026.webp"
    )
  } finally {
    stub.restore()
  }
})

test("a traversal imagePath is rejected at the route, not stored", async () => {
  const archived = archivedPosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response, payload } = await publishRequest({
      title: "Escaping Image Path",
      content: "body",
      imagePath: "/images/../../etc/passwd",
      published: true,
    })

    assert.equal(response.status, 200)
    assert.notEqual(payload.imagePath, "/images/../../etc/passwd")
    assert.equal(payload.imagePath, "/images/AI.webp", "rejected paths fall back to the house image")

    const posts = committedPosts(stub.calls.find((call) => call.method === "PUT")!)
    const stored = posts.find((post) => post.slug === "escaping-image-path")
    assert.ok(stored)
    assert.equal((stored as unknown as Record<string, unknown>).image, "/images/AI.webp")
  } finally {
    stub.restore()
  }
})

test("a READ failure says nothing was written and never commits", async () => {
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
      return new Response("upstream down", { status: 502 })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response, payload } = await publishRequest({
      title: "Doomed Post",
      content: "body",
      published: true,
    })

    assert.equal(response.status, 500)
    assert.equal(payload.code, "read-failed", "a read failure is not a failed commit")
    assert.match(String(payload.error), /nothing was written/)
    assert.equal(
      stub.calls.filter((call) => call.method === "PUT" || call.method === "DELETE").length,
      0,
      "a publish must never write over a list it could not read"
    )
  } finally {
    stub.restore()
  }
})

test("a rejected post write undoes the image commit it preceded", async () => {
  const archived = archivedPosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "GET") {
      return new Response("not found", { status: 404 })
    }
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "image-sha" }, commit: { sha: "1mage" } })
    }
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return new Response('{"message":"sha does not match"}', { status: 409 })
    }
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "DELETE") {
      return jsonResponse({ commit: { sha: "c1eanup" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response, payload } = await publishRequest({
      title: "Orphan Image Post",
      content: "body",
      imageData: Buffer.from("fake-webp").toString("base64"),
      published: true,
    })

    assert.equal(response.status, 409)
    assert.equal(payload.code, "conflict")

    const deletion = stub.calls.find((call) => call.method === "DELETE")
    assert.ok(deletion, "the orphaned image commit was left behind")
    assert.match(deletion.url, /images\/blog\/orphan-image-post\.webp$/)
    assert.equal(deletion.body?.sha, "image-sha", "the delete must pin the blob it wrote")
  } finally {
    stub.restore()
  }
})

test("a rejected post write leaves the ARCHIVED post's image alone", async () => {
  const archived = archivedPosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "GET") {
      return jsonResponse({ sha: "old-image-sha" })
    }
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "image-sha" }, commit: { sha: "1mage" } })
    }
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return new Response('{"message":"sha does not match"}', { status: 409 })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response } = await publishRequest({
      title: archived[0].title,
      content: "body",
      imageData: Buffer.from("fake-webp").toString("base64"),
      published: true,
    })

    assert.equal(response.status, 409)
    assert.equal(
      stub.calls.filter((call) => call.method === "DELETE").length,
      0,
      "the live post still points at that image — deleting it would break the page"
    )
  } finally {
    stub.restore()
  }
})

test("whitespace-only content is refused before any commit", async () => {
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archivedPosts())
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "GET") {
      return new Response("not found", { status: 404 })
    }
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "image-sha" }, commit: { sha: "1mage" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response } = await publishRequest({
      title: "Blank Body Post",
      content: "   ",
      imageData: Buffer.from("fake-webp").toString("base64"),
      published: true,
    })

    assert.equal(response.status, 400)
    assert.equal(
      stub.calls.filter((call) => call.method === "PUT" || call.method === "DELETE").length,
      0,
      "a body the builder will reject must not commit its image first"
    )
  } finally {
    stub.restore()
  }
})

test("isWritableImagePath keeps repository writes inside the image directory", async () => {
  const { isWritableImagePath } = await import("../lib/github.ts")

  for (const unsafe of [
    "public/images/blog/../../data/blogs.json",
    "data/blogs.json",
    "public/images/blog",
    "public/images/blog/",
    "public/images/blog/x.webp?ref=main",
    "public/images/blog/x.webp#frag",
    "public/images/blog/..\\x.webp",
    "/public/images/blog/x.webp",
    "",
  ]) {
    assert.equal(isWritableImagePath(unsafe), false, `${unsafe} must be refused`)
  }

  for (const safe of ["public/images/blog/kenya-ai.webp", "public/images/blog/2026/a.webp"]) {
    assert.equal(isWritableImagePath(safe), true, `${safe} must be allowed`)
  }
})

test("isSafeImagePath rejects traversals and accepts stored image paths", async () => {
  const { isSafeImagePath } = await import("../app/api/studio/publish/route.ts")

  for (const unsafe of [
    "/images/../../etc/passwd",
    "/images/../secret.webp",
    "/images//etc/passwd",
    "https://evil.example/x.webp",
    "data:image/png;base64,AAAA",
    "/public/images/x.webp",
    "",
  ]) {
    assert.equal(isSafeImagePath(unsafe), false, `${unsafe} must be rejected`)
  }

  for (const safe of ["/images/AI.webp", "/images/blog/post-1.webp", "/images/uuid_2-3.webp"]) {
    assert.equal(isSafeImagePath(safe), true, `${safe} must be accepted`)
  }
})
