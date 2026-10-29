/**
 * Server-only access to the build-time copy of the blog archive.
 *
 * `data/blogs.json` is the whole archive — every post body, drafts included —
 * about 550 KB of JSON. Importing this module from a `"use client"` component
 * therefore ships the entire archive in a public JavaScript chunk: that is
 * exactly how drafts used to be readable at `/_next/static/chunks/*.js` on `/`
 * and `/blogs/admin`, without a session.
 *
 * Rules:
 * - Only server components, route handlers, `generateMetadata`, sitemap/feed
 *   routes and scripts may import this.
 * - Client components load posts from `GET /api/blogs` with the admin session
 *   token (drafts included) or without one (published only).
 * - `test/blogs-client-bundle.test.ts` walks every `"use client"` module graph
 *   and fails the suite if it can reach this file or the JSON.
 *
 * This is a build-time snapshot: it goes stale the moment a post is published,
 * because publishing commits to the repository and redeploys. Runtime readers
 * should prefer `GET /api/blogs`. It is used here only where a build-time list
 * is fine — the homepage's three latest previews.
 */

import blogsData from "@/data/blogs.json"
import type { BlogPost } from "@/lib/blogs"

if (typeof window !== "undefined") {
  throw new Error(
    "lib/blogs-data is server-only. Importing it into a client component ships every post body to the browser."
  )
}

export const blogPosts: BlogPost[] = (blogsData.posts as BlogPost[]) || []
