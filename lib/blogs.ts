/**
 * Blog post shape and pure helpers.
 *
 * This module deliberately holds no data. It is imported for `BlogPost` by
 * client and server code alike, so nothing here may pull `data/blogs.json`
 * into a module graph — see `lib/blogs-data.ts` for the server-side archive
 * and `test/blogs-client-bundle.test.ts` for the guard that enforces it.
 */

export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  content: string
  author: string
  category: string
  date: string
  image: string
  published: boolean
}

/**
 * Published posts, newest first, capped at `limit`.
 *
 * Pure so it can be unit-tested without a React tree, and so a component does
 * not have to repeat the filter/sort/slice.
 */
export function latestPublishedPosts(posts: readonly BlogPost[], limit = 3): BlogPost[] {
  return posts
    .filter((post) => post.published)
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit)
}
