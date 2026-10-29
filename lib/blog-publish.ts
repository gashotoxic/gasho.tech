/**
 * Publishing a studio draft into `data/blogs.json`.
 *
 * Pure (no framework imports) so it can be unit-tested: the route decides
 * *whether* a caller may publish, this decides *what the stored file becomes*.
 *
 * Why this exists: `/api/studio/publish` used to commit `{ posts: [onePost] }`
 * — every publish replaced the whole post list with a single post, and the
 * damage was only undone because the studio page then called `/api/blogs` again
 * (which re-read a stale build snapshot). Anything published since that snapshot
 * was lost. A publish must never be able to destroy posts it did not touch, so
 * every write here is a read-merge-write of the *full* list, and a publish is
 * refused outright when the current list cannot be read — a blind write is the
 * original bug.
 */

import type { BlogPostShape } from "./blog-post-update.ts"

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
  | { success: false; error: string; status?: number }

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
 */
export async function publishPostToStore(
  store: PostStore,
  post: BlogPost,
  commitMessage?: string
): Promise<PublishOutcome> {
  let existing: BlogPost[]
  try {
    existing = await store.read()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: `Could not read the current post list, so nothing was written (${detail})`,
    }
  }

  if (!Array.isArray(existing)) {
    return {
      success: false,
      error: "Could not read the current post list, so nothing was written (unexpected shape)",
    }
  }

  const created = !existing.some((candidate) => candidate.slug === post.slug)
  const posts = upsertPost(existing, post)
  const message = commitMessage ?? `feat(blog): publish "${post.title}"`

  const result = await store.write(posts, message)
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "Could not commit the change",
      status: result.status,
    }
  }

  return { success: true, posts, created, url: result.url }
}
