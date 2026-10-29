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
    {
      // The common shape in the real archive: the stored slug is NOT the
      // slugified title (64 of 73 posts), so a title-derived publish used to
      // append a duplicate instead of editing this post.
      slug: "opens-public-consultation-draft-ai-emerging",
      title: "Kenya Opens Public Consultation on Draft AI and Emerging Technologies Policy",
      excerpt: "Consultation details.",
      content: "original consultation body",
      author: "GashoTech",
      category: "Policy",
      date: "2025-09-02",
      image: "/images/opens-public-consultation-draft-ai-emerging.webp",
      published: true,
      tags: ["policy"],
      readTime: 5,
    },
    ...archived,
  ]
}

/** Title-to-slug exactly as the studio and the route derive it. */
function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
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

test("a publish shaped exactly like the studio's does not reset an archived hero", async () => {
  // The studio always sent `imagePath` — `/images/AI.webp` when no image was
  // generated — and the route read any path it was given as an explicit
  // override, so re-generating nothing and re-publishing reset the hero to the
  // house default with a 200 and no warning. This is the payload the shipped
  // client builds, so a browser holding the cached bundle keeps sending it.
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
    const { response, payload } = await publishRequest({
      title: target.title,
      excerpt: "a freshly generated excerpt",
      content: "rewritten body",
      category: target.category,
      author: "GashoTech Team",
      imageData: "",
      imagePath: "/images/AI.webp",
      published: true,
    })

    assert.equal(response.status, 200)
    assert.equal(payload.created, false, "an existing slug must be reported as a replace")

    const posts = committedPosts(stub.calls.find((call) => call.method === "PUT")!)
    assert.equal(posts.length, archived.length, "a re-publish must not add a post")

    const stored = posts.find(
      (post) => post.slug === target.slug
    ) as Record<string, unknown>
    assert.ok(stored)
    assert.equal(
      stored.image,
      target.image,
      "the studio's house-default imagePath clobbered the archived hero image"
    )
  } finally {
    stub.restore()
  }
})

test("a client that names the stored slug updates it even when the title slugifies differently", async () => {
  const archived = archivedPosts()
  const target = archived.find(
    (post) => post.slug === "opens-public-consultation-draft-ai-emerging"
  )!
  assert.notEqual(
    slugFromTitle(target.title),
    target.slug,
    "fixture must reproduce the mismatched-slug shape the real archive has"
  )

  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response, payload } = await publishRequest({
      slug: target.slug,
      title: target.title,
      content: "rewritten consultation body",
      published: true,
    })

    assert.equal(response.status, 200)
    assert.equal(payload.created, false, "the named slug exists — this is an edit")
    assert.equal(payload.slug, target.slug)

    const posts = committedPosts(stub.calls.find((call) => call.method === "PUT")!)
    assert.equal(posts.length, archived.length, "an edit must not append a post")
    const stored = posts.find((post) => post.slug === target.slug) as Record<string, unknown>
    assert.equal(stored.content, "rewritten consultation body")
    assert.equal(stored.date, target.date, "an edit must keep the publish date")
    assert.equal(stored.image, target.image, "an edit must keep the hero image")
  } finally {
    stub.restore()
  }
})

test("a re-publish with no slug finds the archived post by title, not by a derived slug", async () => {
  const archived = archivedPosts()
  const target = archived.find(
    (post) => post.slug === "opens-public-consultation-draft-ai-emerging"
  )!
  assert.notEqual(
    slugFromTitle(target.title),
    target.slug,
    "fixture must reproduce the mismatched-slug shape the real archive has"
  )

  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    // What the studio sends: a title and a body, no slug. The derived slug does
    // not exist in the archive, so before this the publish APPENDED a second copy
    // of the post and reported created: true ("Published successfully!").
    const { response, payload } = await publishRequest({
      title: target.title,
      content: "rewritten consultation body",
      published: true,
    })

    assert.equal(response.status, 200)
    assert.equal(payload.created, false, "the title already exists — this is an edit, not a new post")
    assert.equal(payload.slug, target.slug, "the stored slug is the post's URL and must be kept")

    const posts = committedPosts(stub.calls.find((call) => call.method === "PUT")!)
    assert.equal(posts.length, archived.length, "the publish appended a duplicate post")
    const stored = posts.find((post) => post.slug === target.slug) as Record<string, unknown>
    assert.equal(stored.content, "rewritten consultation body")
    assert.match(
      String(stub.calls.find((call) => call.method === "PUT")?.body?.message),
      /update/
    )
  } finally {
    stub.restore()
  }
})

test("an explicit slug for a title that exists publishes a separate post", async () => {
  const archived = archivedPosts()
  const target = archived.find(
    (post) => post.slug === "opens-public-consultation-draft-ai-emerging"
  )!

  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    // Deliberate: the caller named a URL of its own, so it gets a new post rather
    // than silently rewriting the same-titled one.
    const { response, payload } = await publishRequest({
      slug: "Consultation Copy For Mombasa",
      title: target.title,
      content: "a regional variant",
      published: true,
    })

    assert.equal(response.status, 200)
    assert.equal(payload.slug, "consultation-copy-for-mombasa")
    assert.equal(payload.created, true)

    const posts = committedPosts(stub.calls.find((call) => call.method === "PUT")!)
    assert.equal(posts.length, archived.length + 1)
  } finally {
    stub.restore()
  }
})

test("an unusable explicit slug is refused instead of silently falling back to the title", async () => {
  // Falling back to the derived slug would publish *over* whatever post the title
  // matches — a typo'd slug must fail loudly.
  const stub = stubFetch(() => {
    throw new Error("the route must not touch GitHub for a slug it cannot use")
  })

  try {
    const { response, payload } = await publishRequest({
      slug: "!!!",
      title: "Kenya AI Policy Recap",
      content: "body",
      published: true,
    })

    assert.equal(response.status, 400)
    assert.equal(payload.code, "invalid-slug")
    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test("a house-default imagePath with a cache-buster is still not an override", async () => {
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
    const { response } = await publishRequest({
      title: target.title,
      content: "rewritten body",
      imagePath: "/images/AI.webp?v=2",
      published: true,
    })

    assert.equal(response.status, 200)
    const posts = committedPosts(
      stub.calls.find((call) => call.url.includes(BLOG_CONTENTS) && call.method === "PUT")!
    )
    const stored = posts.find((post) => post.slug === target.slug) as Record<string, unknown>
    assert.equal(stored.image, target.image, "the house default must not reset an archived hero")
  } finally {
    stub.restore()
  }
})

test("an over-long title is refused as too long, not as an invalid title", async () => {
  // No fetch at all: the title is rejected before the archive is read.
  const stub = stubFetch(() => {
    throw new Error("the route must not touch GitHub for a title it cannot slugify")
  })

  try {
    const { response, payload } = await publishRequest({
      title: "Long ".repeat(30),
      content: "body",
      published: true,
    })

    assert.equal(response.status, 400)
    assert.equal(payload.code, "title-too-long")
    assert.match(String(payload.error), /120/)
    assert.doesNotMatch(String(payload.error), /^Invalid title$/)
    assert.equal(stub.calls.length, 0)
  } finally {
    stub.restore()
  }
})

test("an explicit slug is usable even when the title is too long", async () => {
  // The derived slug is never stored when the caller named the URL, so refusing
  // the publish over its length was a 400 about a value nothing would keep.
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
      slug: "a-short-url-for-a-long-title",
      title: "Long ".repeat(30),
      content: "body",
      published: true,
    })

    assert.equal(response.status, 200)
    assert.equal(payload.slug, "a-short-url-for-a-long-title")
  } finally {
    stub.restore()
  }
})

test("a blank slug is treated as not sent, not as an invalid slug", async () => {
  // Forms serialise empty fields, so `slug: ''` is a caller that left the field
  // alone — the title still names the URL.
  const archived = archivedPosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    for (const slug of ["", "   "]) {
      const { response, payload } = await publishRequest({
        slug,
        title: "Blank Slug Post",
        content: "body",
        published: true,
      })

      assert.equal(response.status, 200, `slug ${JSON.stringify(slug)} was refused`)
      assert.equal(payload.slug, "blank-slug-post")
    }
  } finally {
    stub.restore()
  }
})

test("a 404 from the contents API refuses the publish before anything is committed", async () => {
  // `readBlogFile()` reports a 404 as `{ posts: [], missing: true }`. Merging one
  // post into "the archive is empty" would commit `{ posts: [thisPost] }` over all
  // 73 — and, because this route commits the image first, leave the image behind
  // too. The shared write layer refuses before either write happens.
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
      return new Response('{"message":"Not Found"}', { status: 404 })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response, payload } = await publishRequest({
      title: "Would Clobber The Archive",
      content: "body",
      imageData: Buffer.from("fake-webp").toString("base64"),
      published: true,
    })

    assert.equal(response.status, 500)
    assert.equal(payload.code, "read-failed")
    assert.equal(
      stub.calls.filter((call) => call.method === "PUT" || call.method === "DELETE").length,
      0,
      "a 404 must not authorise a write of any kind"
    )
  } finally {
    stub.restore()
  }
})

test("a failed image commit does not point the post at a hero nothing wrote", async () => {
  // The caller prefills the path it expected the image to land at, and the image
  // commit fails. Storing that path committed a hero that 404s while the response
  // said `imageCommitted: false` and 200 — the page had a broken hero and the
  // archived one was gone.
  const archived = archivedPosts()
  const target = archived[0]
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "GET") {
      return new Response("not found", { status: 404 })
    }
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "PUT") {
      return new Response('{"message":"boom"}', { status: 500 })
    }
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response, payload } = await publishRequest({
      title: target.title,
      content: "rewritten body",
      imageData: Buffer.from("fake-webp").toString("base64"),
      imagePath: `/images/blog/${target.slug}.webp`,
      published: true,
    })

    assert.equal(response.status, 200)
    assert.equal(payload.imageCommitted, false)

    const posts = committedPosts(
      stub.calls.find((call) => call.url.includes(BLOG_CONTENTS) && call.method === "PUT")!
    )
    const stored = posts.find((post) => post.slug === target.slug) as Record<string, unknown>
    assert.equal(
      stored.image,
      target.image,
      "the archived hero must be kept when the replacement was never committed"
    )
    assert.notEqual(stored.image, `/images/blog/${target.slug}.webp`)
  } finally {
    stub.restore()
  }
})

test("a failed image commit on a NEW post falls back to the house image", async () => {
  const archived = archivedPosts()
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "GET") {
      return new Response("not found", { status: 404 })
    }
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "PUT") {
      return new Response('{"message":"boom"}', { status: 500 })
    }
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response, payload } = await publishRequest({
      title: "Brand New With A Broken Image",
      content: "body",
      imageData: Buffer.from("fake-webp").toString("base64"),
      imagePath: "/images/blog/brand-new-with-a-broken-image.webp",
      published: true,
    })

    assert.equal(response.status, 200)
    assert.equal(payload.imageCommitted, false)

    const posts = committedPosts(
      stub.calls.find((call) => call.url.includes(BLOG_CONTENTS) && call.method === "PUT")!
    )
    const stored = posts.find(
      (post) => post.slug === "brand-new-with-a-broken-image"
    ) as Record<string, unknown>
    assert.equal(stored.image, "/images/AI.webp", "an uncommitted hero must not be stored")
  } finally {
    stub.restore()
  }
})

test("a re-publish that regenerates its image moves the hero to the new file", async () => {
  const archived = archivedPosts()
  const target = archived[0]
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "GET") {
      return new Response("not found", { status: 404 })
    }
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "image-sha" }, commit: { sha: "1mage" } })
    }
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response, payload } = await publishRequest({
      title: target.title,
      content: "rewritten body",
      imageData: Buffer.from("fake-webp").toString("base64"),
      published: true,
    })

    assert.equal(response.status, 200)
    assert.equal(payload.imageCommitted, true)

    const posts = committedPosts(
      stub.calls.find((call) => call.url.includes(BLOG_CONTENTS) && call.method === "PUT")!
    )
    const stored = posts.find((post) => post.slug === target.slug) as Record<string, unknown>
    assert.equal(stored.image, "/images/blog/kenya-ai-policy-recap.webp")
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

test("a 404 on the pre-delete re-read keeps the image instead of guessing", async () => {
  // The cleanup path deletes a blob only when nothing points at it. A missing
  // file (`{ posts: [], missing: true }`) is "I cannot tell", not "nothing
  // references it": reading it as empty deleted a hero a concurrent writer had
  // just pointed at.
  const archived = archivedPosts()
  let blogReads = 0
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
      blogReads += 1
      // First read: the archive as it is. Second read (the pre-delete check): a
      // transient 404 from the contents API.
      return blogReads === 1 ? blogRead(archived) : new Response('{"message":"Not Found"}', { status: 404 })
    }
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "GET") {
      return new Response("not found", { status: 404 })
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
    const { response, payload } = await publishRequest({
      title: "Orphan Check On A 404",
      content: "body",
      imageData: Buffer.from("fake-webp").toString("base64"),
      published: true,
    })

    assert.equal(response.status, 409)
    assert.equal(payload.code, "conflict")
    assert.equal(
      stub.calls.filter((call) => call.method === "DELETE").length,
      0,
      "a failed re-read must not be read as 'nothing references this image'"
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
  // The archived post's hero IS the file this publish rewrote
  // (`/images/blog/<slug>.webp`), so deleting it would break the live page.
  const archived = archivedPosts()
  archived[0] = { ...archived[0], image: "/images/blog/kenya-ai-policy-recap.webp" }
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

test("a rejected re-publish removes the image it committed when the archive does not use it", async () => {
  // Re-publish of an archived post whose hero is a *different* file: the new
  // blob is referenced by nothing, so leaving it behind is an orphan on main.
  const archived = archivedPosts()
  const target = archived[0]
  assert.notEqual(target.image, "/images/blog/kenya-ai-policy-recap.webp")

  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "GET") {
      return new Response("not found", { status: 404 })
    }
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "image-sha" }, commit: { sha: "1mage" } })
    }
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return new Response("upstream exploded", { status: 500 })
    }
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "DELETE") {
      return jsonResponse({ commit: { sha: "c1eanup" } })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response } = await publishRequest({
      title: target.title,
      content: "body",
      imageData: Buffer.from("fake-webp").toString("base64"),
      published: true,
    })

    assert.equal(response.status, 500)
    const deletion = stub.calls.find((call) => call.method === "DELETE")
    assert.ok(deletion, "the orphaned image commit was left behind on main")
    assert.match(deletion.url, /images\/blog\/kenya-ai-policy-recap\.webp$/)
    assert.equal(deletion.body?.sha, "image-sha", "the delete must pin the blob it wrote")
  } finally {
    stub.restore()
  }
})

test("a rejected write never deletes an image another archived post already uses", async () => {
  // Image paths used to be derived from titles while stored slugs were not, so
  // two posts can share a hero path. Checking only the post being edited would
  // delete a file a *different* live post still renders.
  const archived = archivedPosts()
  archived.push({
    ...archived[2],
    slug: "another-post-with-the-same-hero",
    title: "Another Post With The Same Hero",
    image: "/images/blog/orphan-image-post.webp",
  })

  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") return blogRead(archived)
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "GET") {
      return new Response("not found", { status: 404 })
    }
    if (call.url.includes(IMAGE_CONTENTS) && call.method === "PUT") {
      return jsonResponse({ content: { sha: "image-sha" }, commit: { sha: "1mage" } })
    }
    if (call.url.includes(BLOG_CONTENTS) && call.method === "PUT") {
      return new Response("upstream exploded", { status: 500 })
    }
    throw new Error(`unexpected fetch: ${call.method} ${call.url}`)
  })

  try {
    const { response } = await publishRequest({
      title: "Orphan Image Post",
      content: "body",
      imageData: Buffer.from("fake-webp").toString("base64"),
      published: true,
    })

    assert.equal(response.status, 500)
    assert.equal(
      stub.calls.filter((call) => call.method === "DELETE").length,
      0,
      "another post renders that file — deleting it would break the page"
    )
  } finally {
    stub.restore()
  }
})

test("a 409 cleanup keeps an image the concurrent winner now references", async () => {
  // The image path is deterministic per slug, so a writer that committed between
  // our read and our write may be pointing at the very blob we are about to
  // delete (identical bytes commit to the same sha, so pinning the sha alone is
  // not enough). The route re-reads the archive and keeps the file.
  const archived = archivedPosts()
  let blogReads = 0
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
      blogReads += 1
      if (blogReads === 1) return blogRead(archived)
      return blogRead([
        ...archived,
        {
          ...archived[2],
          slug: "someones-other-post",
          title: "Someone Else's Post",
          image: "/images/blog/orphan-image-post.webp",
        },
      ])
    }
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
    const { response } = await publishRequest({
      title: "Orphan Image Post",
      content: "body",
      imageData: Buffer.from("fake-webp").toString("base64"),
      published: true,
    })

    assert.equal(response.status, 409)
    assert.equal(blogReads, 2, "the route must re-read the archive before deleting")
    assert.equal(
      stub.calls.filter((call) => call.method === "DELETE").length,
      0,
      "the winner's post now points at that file — deleting it would break the page"
    )
  } finally {
    stub.restore()
  }
})

test("a 409 cleanup still removes the image when nothing references it", async () => {
  const archived = archivedPosts()
  let blogReads = 0
  const stub = stubFetch((call) => {
    if (call.url.includes(BLOG_CONTENTS) && call.method === "GET") {
      blogReads += 1
      if (blogReads === 1) return blogRead(archived)
      // The winner committed a different post and did not touch our image.
      return blogRead([
        ...archived,
        { ...archived[2], slug: "someones-other-post", title: "Someone Else's Post" },
      ])
    }
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
    const { response } = await publishRequest({
      title: "Orphan Image Post",
      content: "body",
      imageData: Buffer.from("fake-webp").toString("base64"),
      published: true,
    })

    assert.equal(response.status, 409)
    assert.equal(
      stub.calls.filter((call) => call.method === "DELETE").length,
      1,
      "nothing references the blob, so it must not be left on main"
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
    "public/images/blog/%2e%2e/x.webp",
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
    "/images/../secret.webp?v=3",
    "/images//etc/passwd",
    "https://evil.example/x.webp",
    "data:image/png;base64,AAAA",
    "/public/images/x.webp",
    "/images/blog/x.webp?ref=main&x=1",
    "/images/blog/x.webp#frag",
    "/images/blog/x.webp?v=3#frag",
    "/images/blog/x.webp?v=3?x=1",
    "",
  ]) {
    assert.equal(isSafeImagePath(unsafe), false, `${unsafe} must be rejected`)
  }

  for (const safe of [
    "/images/AI.webp",
    "/images/blog/post-1.webp",
    "/images/uuid_2-3.webp",
    // Five archived posts store a cache-buster on their hero. Rejecting those
    // would make any prefill rewrite them to the house default.
    "/images/legacy-hero.webp?v=3",
  ]) {
    assert.equal(isSafeImagePath(safe), true, `${safe} must be accepted`)
  }
})
