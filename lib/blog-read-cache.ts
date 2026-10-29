/**
 * A short in-process memo for the *public* blog read.
 *
 * Why this exists: every anonymous render of `/blogs` or `/blogs/[slug]` calls
 * `GET /api/blogs`, and that route reads `data/blogs.json` from the GitHub
 * contents API with a token — one authenticated call per render, three for a
 * post page (`generateMetadata` and the page both fetch). `/api/blogs` is
 * unauthenticated and cacheable for 60s, but `s-maxage` only helps when a shared
 * cache actually holds the response: a preview deployment, a `no-store` fetch or
 * cold traffic all reach the origin, and every one of those spends the same
 * 5,000/hour token budget the write path needs to publish.
 *
 * 30 seconds is short enough that a publish is visible almost immediately (a
 * shared cache would have served the same list for up to 60s) and long enough
 * that a burst of traffic costs one upstream read instead of one per viewer.
 *
 * Only the anonymous read path uses this. A write and an admin read must never
 * see a memoised list: they pin the sha they read, and a stale sha turns into a
 * 409 for a user who did nothing wrong.
 */
import { readBlogFile, type BlogFileSnapshot } from "./github.ts"

export const READ_CACHE_TTL_MS = 30_000

let cached: { at: number; snapshot: BlogFileSnapshot } | null = null

/**
 * Read the live archive, reusing a read younger than `READ_CACHE_TTL_MS`.
 *
 * A failed read is not memoised (it throws straight out), and neither is a
 * missing file: the caller treats that as "serve the deployed snapshot", and
 * pinning an outage in place for another 30 seconds would keep the blog stale
 * long after the repository is readable again.
 */
export async function readBlogFileCached(now: number = Date.now()): Promise<BlogFileSnapshot> {
  if (cached && now - cached.at < READ_CACHE_TTL_MS) return cached.snapshot

  const snapshot = await readBlogFile()
  if (!snapshot.missing) cached = { at: now, snapshot }
  return snapshot
}

/** Drop the memo — for tests, and for a writer inside this process. */
export function clearBlogReadCache(): void {
  cached = null
}
