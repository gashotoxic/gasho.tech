import { test } from "node:test"
import assert from "node:assert/strict"

/**
 * Boundary tests for the write that actually lands in `data/blogs.json`.
 *
 * The publish route's read-merge-write lives in lib/blog-publish.ts (covered by
 * blog-publish.test.ts), but nothing there proves that what reaches the GitHub
 * contents API is the FULL post list rather than one post, nor that the sha the
 * route read is pinned onto the commit. Those are the two properties the
 * one-post-clobber bug violated, so they are asserted here against a stubbed
 * fetch — no network, no token.
 */

process.env.GH_TOKEN = "test-token"

const API_BASE = "https://api.github.com/repos/gashotoxic/gasho.tech/contents/data/blogs.json"

interface Recorded {
  url: string
  method: string
  body?: Record<string, unknown>
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function stubFetch(handlers: Array<() => Response>) {
  const calls: Recorded[] = []
  const original = globalThis.fetch

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
    calls.push({ url, method, body })

    const handler = handlers.shift()
    if (!handler) throw new Error(`unexpected fetch: ${method} ${url}`)
    return handler()
  }) as typeof fetch

  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

function decodeCommitted(body: Record<string, unknown> | undefined): { posts: unknown[] } {
  assert.ok(body, "no request body was sent")
  const decoded = Buffer.from(String(body.content), "base64").toString("utf-8")
  return JSON.parse(decoded) as { posts: unknown[] }
}

const FULL_LIST = Array.from({ length: 72 }, (_, i) => ({
  slug: `archived-${i + 1}`,
  title: `Archived ${i + 1}`,
}))

test("commitBlogChanges sends the whole list with the sha the caller read", async () => {
  const { commitBlogChanges } = await import("../lib/github.ts")
  // A pinned sha means no extra GET: the caller already read the file.
  const stub = stubFetch([() => jsonResponse({ content: { sha: "new-sha" }, commit: { sha: "c0ffee" } })])

  try {
    const content = JSON.stringify({ posts: FULL_LIST }, null, 2)
    const result = await commitBlogChanges(content, 'feat(blog): publish "x"', "read-sha")

    assert.equal(result.success, true)
    assert.equal(stub.calls.length, 1, "pinned sha must not re-fetch the file")
    const [commit] = stub.calls
    assert.equal(commit.method, "PUT")
    assert.equal(commit.url, API_BASE)
    assert.equal(commit.body?.sha, "read-sha", "the sha the caller read must be pinned")

    const committed = decodeCommitted(commit.body)
    assert.equal(committed.posts.length, 72, "the committed file must hold every post")
  } finally {
    stub.restore()
  }
})

test("a commit without a sha is refused before it can overwrite anything", async () => {
  const { commitBlogChanges } = await import("../lib/github.ts")
  // JS callers can still pass nothing; the type says they cannot, and this is the
  // runtime half of the same rule. An unpinned write is the clobber bug.
  const stub = stubFetch([])

  try {
    const result = await commitBlogChanges(
      JSON.stringify({ posts: FULL_LIST }, null, 2),
      "feat(blog): publish",
      undefined as unknown as string
    )

    assert.equal(result.success, false)
    assert.match(String(result.error), /Refusing to commit without the sha/)
    assert.equal(stub.calls.length, 0, "nothing may reach GitHub without a base")
  } finally {
    stub.restore()
  }
})

test("a 404 read is a refusal to write, not a first publish", async () => {
  const { readBlogFileForWrite } = await import("../lib/github.ts")
  const stub = stubFetch([() => new Response("not found", { status: 404 })])

  try {
    // A first-ever publish used to be the excuse for treating 404 as "empty".
    // Over an archive that exists, 404 means a bad ref, a token without access or
    // an outage — and a write based on it replaces every post with one.
    await assert.rejects(readBlogFileForWrite(), /not found in the repository/)
  } finally {
    stub.restore()
  }
})

test("a rejected read is reported, and no write follows", async () => {
  const { readBlogFileForWrite } = await import("../lib/github.ts")
  const stub = stubFetch([() => jsonResponse({ message: "boom" }, 500)])

  try {
    await assert.rejects(readBlogFileForWrite(), /500/)
    assert.equal(stub.calls.filter((call) => call.method === "PUT").length, 0)
  } finally {
    stub.restore()
  }
})

test("a read that carries no blob sha cannot be written over", async () => {
  const { readBlogFileForWrite } = await import("../lib/github.ts")
  const stub = stubFetch([
    () =>
      jsonResponse({
        // A 200 without a sha: nothing to pin a commit to.
        encoding: "base64",
        content: Buffer.from(JSON.stringify({ posts: [] }), "utf-8").toString("base64"),
      }),
  ])

  try {
    await assert.rejects(readBlogFileForWrite(), /without a blob sha/)
  } finally {
    stub.restore()
  }
})

test("a sha conflict surfaces as status 409 so the route can say 'retry'", async () => {
  const { commitBlogChanges } = await import("../lib/github.ts")
  const stub = stubFetch([() => new Response('{"message":"sha does not match"}', { status: 409 })])

  try {
    const result = await commitBlogChanges(JSON.stringify({ posts: [] }, null, 2), "feat(blog): publish", "stale")

    assert.equal(result.success, false)
    assert.equal(result.status, 409)
  } finally {
    stub.restore()
  }
})

test("readBlogFile reports a missing file instead of failing a first publish", async () => {
  const { readBlogFile } = await import("../lib/github.ts")
  const stub = stubFetch([() => new Response("not found", { status: 404 })])

  try {
    const snapshot = await readBlogFile()
    assert.deepEqual(snapshot.posts, [])
    assert.equal(snapshot.missing, true)
  } finally {
    stub.restore()
  }
})

test("readBlogFile throws rather than inventing an empty archive", async () => {
  const { readBlogFile } = await import("../lib/github.ts")

  for (const response of [
    () => new Response("upstream down", { status: 502 }),
    () => jsonResponse({ sha: "x", content: Buffer.from('{"posts": "nope"}').toString("base64"), encoding: "base64" }),
  ]) {
    const stub = stubFetch([response])
    try {
      await assert.rejects(readBlogFile())
    } finally {
      stub.restore()
    }
  }
})
