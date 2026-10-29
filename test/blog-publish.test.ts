import { test } from "node:test"
import assert from "node:assert/strict"

import {
  publishPostToStore,
  upsertPost,
  type BlogPost,
  type PostStore,
} from "../lib/blog-publish.ts"

/**
 * Regression for review R2: `/api/studio/publish` built `{ posts: [thisPost] }`
 * and committed it, so one publish replaced the whole of data/blogs.json. It only
 * looked fine because the studio page immediately called `/api/blogs` again with
 * a stale build snapshot — everything published since that build was gone.
 *
 * These tests drive the same read → merge → write path the route uses, against a
 * store that serialises like the real file, and assert on WHATEVER LANDS IN THE
 * FILE (not on the returned object).
 */

const EXISTING: BlogPost[] = Array.from({ length: 72 }, (_, i) => ({
  slug: `archived-post-${i + 1}`,
  title: `Archived post ${i + 1}`,
  excerpt: "excerpt",
  content: "body",
  author: "GashoTech Team",
  category: "AI",
  date: "2026-10-01",
  image: "/images/AI.webp",
  published: true,
}))

function newPost(slug: string): BlogPost {
  return {
    slug,
    title: `Title ${slug}`,
    excerpt: "fresh excerpt",
    content: "fresh body",
    author: "GashoTech Team",
    category: "Technology",
    date: "2026-10-28",
    image: "/images/blog/x.webp",
    published: true,
  }
}

/**
 * Stands in for data/blogs.json in the repo: content is kept as the JSON string
 * that would be committed, so a write that drops posts really does drop them.
 */
function makeFileStore(initial: BlogPost[]) {
  let file = initial.length ? JSON.stringify({ posts: initial }, null, 2) : null
  const writtenPayloads: string[] = []
  const committedMessages: string[] = []

  const store: PostStore = {
    read: async () => {
      if (file === null) throw new Error("data/blogs.json not readable")
      const parsed = JSON.parse(file) as { posts?: BlogPost[] }
      if (!Array.isArray(parsed.posts)) throw new Error("no post list in file")
      return parsed.posts
    },
    write: async (posts, commitMessage) => {
      const payload = JSON.stringify({ posts }, null, 2)
      writtenPayloads.push(payload)
      committedMessages.push(commitMessage)
      file = payload
      return { success: true, url: "https://github.com/gashotoxic/gasho.tech/commit/abc" }
    },
  }

  return {
    store,
    writtenPayloads,
    committedMessages,
    /** What a reader of the repo would see. */
    postsInFile: () => (JSON.parse(file as string) as { posts: BlogPost[] }).posts,
  }
}

test("publishing a post keeps all 72 archived posts", async () => {
  const repo = makeFileStore(EXISTING)

  const result = await publishPostToStore(repo.store, newPost("first-new"))
  assert.equal(result.success, true)

  const posts = repo.postsInFile()
  assert.equal(posts.length, 73, "one publish must not shrink the archive")
  for (const archived of EXISTING) {
    assert.ok(
      posts.some((post) => post.slug === archived.slug),
      `publish dropped archived post ${archived.slug}`
    )
  }
  assert.ok(posts.some((post) => post.slug === "first-new"))
})

test("publishing post A then post B leaves both in the file", async () => {
  const repo = makeFileStore(EXISTING)

  const first = await publishPostToStore(repo.store, newPost("post-a"))
  assert.equal(first.success, true)
  assert.equal(first.success && first.created, true)

  const second = await publishPostToStore(repo.store, newPost("post-b"))
  assert.equal(second.success, true)

  const slugs = repo.postsInFile().map((post) => post.slug)
  assert.equal(slugs.length, 74)
  assert.ok(slugs.includes("post-a"), "post A was clobbered by publishing post B")
  assert.ok(slugs.includes("post-b"))
  for (const archived of EXISTING) {
    assert.ok(slugs.includes(archived.slug), `archived post ${archived.slug} was clobbered`)
  }
})

test("every committed payload contains the full post list, never a single post", async () => {
  const repo = makeFileStore(EXISTING)

  await publishPostToStore(repo.store, newPost("payload-check"))

  assert.equal(repo.writtenPayloads.length, 1)
  const committed = JSON.parse(repo.writtenPayloads[0]) as { posts: BlogPost[] }
  assert.equal(committed.posts.length, 73, "the committed file held only the new post")
  assert.equal(committed.posts.at(-1)?.slug, "payload-check")
  assert.match(repo.committedMessages[0], /publish/, "commit message must describe the publish")
})

test("re-publishing an existing slug replaces it in place, without duplicating", async () => {
  const repo = makeFileStore(EXISTING)
  const target = EXISTING[10]
  const edited: BlogPost = { ...target, title: "Rewritten title", content: "Rewritten body" }

  const result = await publishPostToStore(repo.store, edited)
  assert.equal(result.success, true)
  assert.equal(result.success && result.created, false)

  const posts = repo.postsInFile()
  assert.equal(posts.length, 72, "a rewrite must not add a post")
  assert.equal(posts[10].slug, target.slug, "a rewrite must keep the archive order")
  assert.equal(posts[10].title, "Rewritten title")
  assert.equal(posts.filter((post) => post.slug === target.slug).length, 1)
})

test("a publish refuses to write when the current list cannot be read", async () => {
  let writes = 0
  const store: PostStore = {
    read: async () => {
      throw new Error("GitHub read failed: 502")
    },
    write: async () => {
      writes += 1
      return { success: true }
    },
  }

  const result = await publishPostToStore(store, newPost("blind-write"))

  assert.equal(result.success, false)
  assert.match(result.success ? "" : result.error, /nothing was written/)
  assert.equal(writes, 0, "a blind write on an unreadable list is the original bug")
})

test("a failed commit is reported as a failure, not a success", async () => {
  const store: PostStore = {
    read: async () => EXISTING,
    write: async () => ({ success: false, error: "Commit failed: 409" }),
  }

  const result = await publishPostToStore(store, newPost("conflict"))
  assert.equal(result.success, false)
  assert.match(result.success ? "" : result.error, /409/)
})

test("upsertPost never mutates the list it was given", () => {
  const posts = EXISTING.slice(0, 3)
  const merged = upsertPost(posts, newPost("appended"))

  assert.equal(posts.length, 3, "input array was mutated")
  assert.equal(merged.length, 4)
})

test("re-publishing keeps the archived tags and readTime", () => {
  const archived: BlogPost = {
    ...EXISTING[0],
    slug: "tagged-post",
    tags: ["M-PESA", "Kenya"],
    readTime: 6,
  }
  // buildNewPost from the publish route sets neither: this path has no tag editor.
  const republished: BlogPost = { ...newPost("tagged-post"), tags: undefined, readTime: undefined }

  const [merged] = upsertPost([archived], republished)

  assert.deepEqual(merged.tags, ["M-PESA", "Kenya"], "re-publish blanked the tags")
  assert.equal(merged.readTime, 6, "re-publish blanked the read time")
  assert.equal(merged.title, republished.title, "body fields must still come from the publish")
})

test("explicit tags on the incoming post win over the archived ones", () => {
  const archived: BlogPost = { ...EXISTING[0], slug: "tagged-post", tags: ["old"], readTime: 6 }
  const incoming: BlogPost = { ...newPost("tagged-post"), tags: ["new"], readTime: 2 }

  const [merged] = upsertPost([archived], incoming)

  assert.deepEqual(merged.tags, ["new"])
  assert.equal(merged.readTime, 2)
})

test("a duplicated slug is collapsed to one post, at the first position", () => {
  // No duplicate exists in the archive today; this only has to be safe if one
  // ever appears. Replacing the first match used to leave the twin behind.
  const first: BlogPost = { ...EXISTING[0], slug: "twice", title: "First copy" }
  const twin: BlogPost = { ...EXISTING[1], slug: "twice", title: "Second copy" }
  const list = [EXISTING[2], first, EXISTING[3], twin]

  const merged = upsertPost(list, newPost("twice"))

  assert.equal(merged.filter((post) => post.slug === "twice").length, 1)
  assert.equal(merged[1].title, newPost("twice").title, "the edit must land on the first copy")
  assert.equal(merged.length, 3, "the duplicate must be dropped, not kept alongside")
  assert.deepEqual(
    merged.map((post) => post.slug),
    [EXISTING[2].slug, "twice", EXISTING[3].slug],
    "dropping the twin must not reorder the archive"
  )
})
