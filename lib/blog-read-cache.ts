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

/**
 * How long a *missing* archive is remembered. Much shorter than a hit, because a
 * missing file is a state that should heal as soon as someone publishes — but not
 * zero, because it is exactly as expensive to discover as a hit.
 *
 * Without this the 404 was re-probed once per anonymous render: a persistent 404
 * (wrong ref, token without access, the file genuinely gone) cost one
 * authenticated contents call per viewer, which is the 5,000/hour burn this memo
 * exists to stop — the very failure it did not cover.
 */
export const MISSING_CACHE_TTL_MS = 5_000

let cached: { at: number; snapshot: BlogFileSnapshot } | null = null

/**
 * Read the live archive, reusing a read younger than its TTL: `READ_CACHE_TTL_MS`
 * for a list, `MISSING_CACHE_TTL_MS` for a 404 (`{ posts: [], missing: true }`).
 *
 * A read that *throws* is not memoised — that is a request-level failure (no
 * token, network, GitHub 5xx), and pinning "unreadable" in place for even a few
 * seconds would keep the blog on its snapshot fallback after the repository is
 * readable again. The cheap, common, repeated failure is the 404, and that one is
 * cached.
 */
export async function readBlogFileCached(now: number = Date.now()): Promise<BlogFileSnapshot> {
  if (cached) {
    const ttl = cached.snapshot.missing ? MISSING_CACHE_TTL_MS : READ_CACHE_TTL_MS
    if (now - cached.at < ttl) return cached.snapshot
  }

  const snapshot = await readBlogFile()
  cached = { at: now, snapshot }
  return snapshot
}

/** Drop the memo — for tests, and for a writer inside this process. */
export function clearBlogReadCache(): void {
  cached = null
}
