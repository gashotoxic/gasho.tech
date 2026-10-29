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

/**
 * How long a *failed* read (thrown: no token, network, GitHub 5xx, the 8s bound)
 * is remembered before it is retried.
 *
 * The failure mode is the same burn as a 404, one level worse: during a GitHub
 * outage every render misses the memo (nothing was cached), so each one spends an
 * authenticated contents call — two per post page — chasing an upstream that is
 * already failing. Enough traffic and the shared GH_TOKEN budget is gone, and the
 * publish path (which needs the same token) fails too: a read outage becomes
 * "cannot publish".
 *
 * 5 seconds keeps the fallback honest: the blog starts using the archive again
 * within one negative TTL of GitHub recovering, and the error is *re-thrown*, so
 * the caller still sees the failure and still falls back to its snapshot.
 */
export const FAILURE_CACHE_TTL_MS = 5_000

let cached: { at: number; snapshot: BlogFileSnapshot } | null = null
let failed: { at: number; error: unknown } | null = null

/**
 * Read the live archive, reusing a read younger than its TTL:
 *
 * - a list: `READ_CACHE_TTL_MS`
 * - a 404 (`{ posts: [], missing: true }`): `MISSING_CACHE_TTL_MS`
 * - a thrown failure: `FAILURE_CACHE_TTL_MS`, re-thrown so the caller still
 *   treats it as a failed read and falls back
 */
export async function readBlogFileCached(now: number = Date.now()): Promise<BlogFileSnapshot> {
  if (cached) {
    const ttl = cached.snapshot.missing ? MISSING_CACHE_TTL_MS : READ_CACHE_TTL_MS
    if (now - cached.at < ttl) return cached.snapshot
  }

  if (failed && now - failed.at < FAILURE_CACHE_TTL_MS) throw failed.error

  try {
    const snapshot = await readBlogFile()
    cached = { at: now, snapshot }
    failed = null
    return snapshot
  } catch (error) {
    failed = { at: now, error }
    throw error
  }
}

/** Drop the memo — for tests, and for a writer inside this process. */
export function clearBlogReadCache(): void {
  cached = null
  failed = null
}
