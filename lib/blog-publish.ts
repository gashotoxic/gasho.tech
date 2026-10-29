/**
 * The write layer for `data/blogs.json`: publishing a studio draft, editing a
 * post, deleting a post.
 *
 * Pure (no framework imports) so it can be unit-tested: the route decides
 * *whether* a caller may write, this decides *what the stored file becomes*.
 *
 * Why this exists: `/api/studio/publish` used to commit `{ posts: [onePost] }`
 * — every publish replaced the whole post list with a single post, and the
 * damage was only undone because the studio page then called `/api/blogs` again
 * (which re-read a stale build snapshot). Anything published since that snapshot
 * was lost. A publish must never be able to destroy posts it did not touch, so
 * every write here is a read-merge-write of the *full* list, and a publish is
 * refused outright when the current list cannot be read — a blind write is the
 * original bug.
 *
 * `/api/blogs` (POST/PUT/DELETE) had the same bug from the other direction: it
 * built its list from a `/tmp` cache or the build-time snapshot and committed it
 * with no pinned sha, so one call could resurrect a deleted post and destroy
 * everything published since the build. It now goes through this module too.
 */

import { applyPostUpdate, type BlogPostShape } from "./blog-post-update.ts"

/** Post shape as stored in `data/blogs.json`. */
export type BlogPost = BlogPostShape

export interface StoredBlogFile {
  posts: BlogPost[]
}

/** The only two things publishing needs from storage; injected for tests. */
export interface PostStore {
  /** Current full post list. Must throw rather than return `[]` on failure. */
  read: () => Promise<BlogPost[]>
  write: (
    posts: BlogPost[],
    commitMessage: string
  ) => Promise<{ success: boolean; error?: string; url?: string; status?: number }>
}

export type PublishOutcome =
  | { success: true; posts: BlogPost[]; created: boolean; url?: string }
  | StoreFailure

/**
 * Why a write was refused, so routes can map it to a status code instead of
 * guessing from an error string.
 *
 * - `read-failed`   — the current list could not be read, so nothing was written
 * - `exists`        — a create was refused because the slug is already archived
 * - `not-found`     — the post a mutation names is not in the list
 * - `conflict`      — the file changed between our read and our write (GitHub 409)
 * - `commit-failed` — the write itself failed for another reason
 */
export type StoreFailureCode = "read-failed" | "exists" | "not-found" | "conflict" | "commit-failed"

export interface StoreFailure {
  success: false
  error: string
  code: StoreFailureCode
  status?: number
}

export type UpdateOutcome =
  | { success: true; post: BlogPost; posts: BlogPost[]; url?: string }
  | StoreFailure

export type DeleteOutcome =
  | { success: true; deleted: BlogPost; posts: BlogPost[]; url?: string }
  | StoreFailure

function readFailure(error: unknown): StoreFailure {
  const detail = error instanceof Error ? error.message : String(error)
  return {
    success: false,
    code: "read-failed",
    error: `Could not read the current post list, so nothing was written (${detail})`,
  }
}

/**
 * A sha conflict is not a server fault: someone else committed between our read
 * and our write. It has its own code so the route can answer 409 and mean it.
 */
function writeFailure(result: {
  error?: string
  status?: number
}): StoreFailure {
  if (result.status === 409) {
    return {
      success: false,
      code: "conflict",
      status: 409,
      error: result.error ?? "data/blogs.json changed while this write was in flight",
    }
  }
  return {
    success: false,
    code: "commit-failed",
    status: result.status,
    error: result.error ?? "Could not commit the change",
  }
}


/**
 * Insert `post` into `posts`, replacing any existing post with the same slug.
 *
 * Order is preserved: a replacement keeps its original position (so a publish
 * cannot reorder the archive), a new post is appended. The input array is never
 * mutated — callers may hold it in a cache.
 *
 * Duplicates are collapsed, not left behind: if the file ever holds the same slug
 * twice, replacing only the first match would keep a stale twin that renders the
 * same post a second time and makes the next edit land on an arbitrary copy.
 *
 * A replace keeps the archived `tags`/`readTime` when the incoming post has none:
 * this publish path has no tag or read-time editor, so re-publishing a title must
 * not silently blank metadata 67 of 72 posts carry. (`date`, `image`, `excerpt`,
 * `author` and `category` are preserved where the post is *built* — see
 * `buildNewPost(..., existing)` — because only the builder still knows which
 * fields the caller actually sent.)
 */
export function upsertPost(posts: readonly BlogPost[], post: BlogPost): BlogPost[] {
  const index = posts.findIndex((candidate) => candidate.slug === post.slug)
  if (index === -1) return [...posts, post]

  const existing = posts[index]
  // `findIndex` returns the first match, so every other post with this slug sits
  // after `index` — dropping them leaves `index` pointing at the right slot.
  const merged = posts.filter(
    (candidate, position) => position === index || candidate.slug !== post.slug
  )
  merged[index] = {
    ...post,
    tags: post.tags ?? existing.tags,
    readTime: post.readTime ?? existing.readTime,
  }
  return merged
}

/**
 * Read the current list, merge `post` into it, and write the result back.
 *
 * Refuses (without writing) when the read fails: publishing on top of an
 * unknown post list is exactly how 72 posts get clobbered by one.
 *
 * `options.refuseExisting` turns this into a *create*: an archived slug is
 * refused instead of replaced. The studio's publish is deliberately an upsert
 * (re-publishing a title is how it edits a post), but an admin "new post" form
 * must not silently overwrite a published post that happens to share a slug.
 */
export async function publishPostToStore(
  store: PostStore,
  post: BlogPost,
  commitMessage?: string,
  options: { refuseExisting?: boolean } = {}
): Promise<PublishOutcome> {
  let existing: BlogPost[]
  try {
    existing = await store.read()
  } catch (error) {
    return readFailure(error)
  }

  if (!Array.isArray(existing)) {
    return {
      success: false,
      code: "read-failed",
      error: "Could not read the current post list, so nothing was written (unexpected shape)",
    }
  }

  const created = !existing.some((candidate) => candidate.slug === post.slug)
  if (!created && options.refuseExisting) {
    return {
      success: false,
      code: "exists",
      status: 409,
      error: "A post with this slug already exists",
    }
  }

  const posts = upsertPost(existing, post)
  const message = commitMessage ?? `feat(blog): publish "${post.title}"`

  const result = await store.write(posts, message)
  if (!result.success) {
    return writeFailure(result)
  }

  return { success: true, posts, created, url: result.url }
}

/**
 * Apply a field-level edit to one archived post, read-merge-write.
 *
 * Same discipline as a publish: the list is read first, the edit is applied to
 * the post as it exists *now* (so an edit cannot resurrect a stale copy or drop
 * the other 72 posts), and the write carries the sha that was read so a
 * concurrent commit fails instead of being silently overwritten.
 */
export async function updatePostInStore(
  store: PostStore,
  slug: string,
  update: unknown,
  commitMessage?: string
): Promise<UpdateOutcome> {
  let existing: BlogPost[]
  try {
    existing = await store.read()
  } catch (error) {
    return readFailure(error)
  }

  if (!Array.isArray(existing)) {
    return {
      success: false,
      code: "read-failed",
      error: "Could not read the current post list, so nothing was written (unexpected shape)",
    }
  }

  const current = existing.find((candidate) => candidate.slug === slug)
  if (!current) {
    return { success: false, code: "not-found", status: 404, error: "Post not found" }
  }

  const post = applyPostUpdate(current, update)
  const posts = upsertPost(existing, post)
  const message = commitMessage ?? `feat(blog): update post "${post.title}"`

  const result = await store.write(posts, message)
  if (!result.success) {
    return writeFailure(result)
  }

  return { success: true, post, posts, url: result.url }
}

/**
 * Remove one post, read-merge-write. Everything else in the list is carried
 * over untouched — the same reason a publish may not build its own list.
 */
export async function deletePostFromStore(
  store: PostStore,
  slug: string,
  commitMessage?: string
): Promise<DeleteOutcome> {
  let existing: BlogPost[]
  try {
    existing = await store.read()
  } catch (error) {
    return readFailure(error)
  }

  if (!Array.isArray(existing)) {
    return {
      success: false,
      code: "read-failed",
      error: "Could not read the current post list, so nothing was written (unexpected shape)",
    }
  }

  const deleted = existing.find((candidate) => candidate.slug === slug)
  if (!deleted) {
    return { success: false, code: "not-found", status: 404, error: "Post not found" }
  }

  const posts = existing.filter((candidate) => candidate.slug !== slug)
  const message = commitMessage ?? `feat(blog): delete post "${deleted.title}"`

  const result = await store.write(posts, message)
  if (!result.success) {
    return writeFailure(result)
  }

  return { success: true, deleted, posts, url: result.url }
}

/**
 * The posts an anonymous caller may read: published only.
 *
 * A draft's body is not public before publication, and `GET /api/blogs` used to
 * hand the whole file — drafts included — to anyone who asked.
 */
export function publicPosts(posts: readonly BlogPost[]): BlogPost[] {
  return posts.filter((post) => post.published === true)
}

