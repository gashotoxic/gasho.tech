/**
 * The build-time copy of `data/blogs.json`, and how old it is allowed to be.
 *
 * The deployed file is a snapshot from the build that produced this deployment.
 * It exists so a GitHub outage does not blank the blog — but it must never
 * *become* the blog: a deployment whose archive cannot be read served this list
 * forever, signalled by nothing but a `console.warn`, so every post published
 * since that build was simply missing.
 *
 * Two things are load-bearing here:
 *
 * 1. **The age anchor is the deployment's build stamp, not the file's mtime.**
 *    An mtime says when a file was written to *this* filesystem, and Vercel can
 *    hand a warm workspace a checkout copied moments ago — so a months-old build
 *    could look five minutes old and pass a 24-hour bound while serving a
 *    months-old archive. `NEXT_PUBLIC_BUILD_TIME` is baked in by next.config.ts
 *    when the bundle is built, which is exactly the question the bound asks. The
 *    mtime is still used when there is no stamp (a local `next start`), and the
 *    result says which anchor was used so the log does not overclaim.
 *
 * 2. **The bound has hysteresis.** 24 hours is when the fallback starts being a
 *    problem worth an alarm; 48 hours is when it is worse than an honest 503.
 *    A single cliff means a deployment that is 24h+1s old flips the blog from
 *    "serving" to "503" on nothing but the clock, with no warning step.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import type { BlogPostShape } from "./blog-post-update.ts"

/** Past this the fallback is worth an alarm — every read is serving a stale list. */
export const SNAPSHOT_WARN_AGE_MS = 24 * 60 * 60 * 1000

/** Past this the fallback is refused: a 503 is more honest than a stale blog. */
export const MAX_SNAPSHOT_AGE_MS = 48 * 60 * 60 * 1000

/**
 * Where the deployed copy lives.
 *
 * `BLOG_SNAPSHOT_FILE` exists for tests: the suite used to `utimes` and `rename`
 * the *tracked* `data/blogs.json`, so a killed run left the checkout without the
 * archive (and a passing run still rewrote a tracked file's mtime). A test can
 * point this at a tmpdir copy instead.
 */
export function snapshotFilePath(): string {
  return process.env.BLOG_SNAPSHOT_FILE || path.join(process.cwd(), "data", "blogs.json")
}

/**
 * When this deployment's bundle was built, in epoch ms — or `null` when the
 * running process has no stamp (a test, a bare `node`, a config that predates it).
 *
 * Read at call time, not at import time: the tests set it per case.
 */
export function buildStampMs(): number | null {
  const raw = process.env.NEXT_PUBLIC_BUILD_TIME
  if (!raw) return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export interface BlogSnapshotPosts {
  posts: BlogPostShape[]
  /** When this deployment was built (or the file's mtime, see `builtAtSource`). */
  builtAt: number | null
  /** Which anchor `builtAt` came from: the build stamp, or the file's mtime. */
  builtAtSource: "build" | "mtime"
}

/**
 * The deployed copy of the archive, or `null` when this deployment has none.
 *
 * `null` covers every "there is nothing to serve" case on purpose: a missing
 * file, unreadable JSON, or JSON without a post list. The caller only ever needs
 * "can I serve this?" — and a partial answer would be worse than none.
 */
export async function readBlogSnapshot(
  filePath: string = snapshotFilePath()
): Promise<BlogSnapshotPosts | null> {
  try {
    const [stat, raw] = await Promise.all([
      fs.stat(filePath),
      fs.readFile(filePath, "utf-8"),
    ])
    const parsed = JSON.parse(raw) as { posts?: unknown }
    if (!Array.isArray(parsed.posts)) return null

    const stamp = buildStampMs()
    return stamp === null
      ? { posts: parsed.posts as BlogPostShape[], builtAt: stat.mtimeMs, builtAtSource: "mtime" }
      : { posts: parsed.posts as BlogPostShape[], builtAt: stamp, builtAtSource: "build" }
  } catch {
    return null
  }
}

export type SnapshotAgeState = "fresh" | "stale" | "expired" | "unknown"

export interface SnapshotAgeVerdict {
  state: SnapshotAgeState
  /** Age in ms, or `null` when the anchor is unusable. */
  ageMs: number | null
  limitMs: number
}

/**
 * How the fallback is allowed to be used at this age.
 *
 * - `fresh`   — under `SNAPSHOT_WARN_AGE_MS`; serve it.
 * - `stale`   — 24–48 h; serve it, log loudly, and mark the response.
 * - `expired` — over `MAX_SNAPSHOT_AGE_MS`; refuse it (the caller answers 503).
 * - `unknown` — no usable anchor; serve it and say the bound was not applied.
 *
 * An unusable stamp (unset, epoch, in the future) disables the bound instead of
 * tripping it: a nonsense clock must not be able to take the blog offline on its
 * own, and the `X-Blog-Source` / `X-Blog-Snapshot-Age` headers still report the
 * truth.
 */
export function snapshotAgeVerdict(builtAt: number | null, now: number): SnapshotAgeVerdict {
  if (typeof builtAt !== "number" || !Number.isFinite(builtAt) || builtAt <= 0) {
    return { state: "unknown", ageMs: null, limitMs: MAX_SNAPSHOT_AGE_MS }
  }
  const ageMs = Math.max(0, now - builtAt)
  if (ageMs > MAX_SNAPSHOT_AGE_MS) return { state: "expired", ageMs, limitMs: MAX_SNAPSHOT_AGE_MS }
  if (ageMs >= SNAPSHOT_WARN_AGE_MS) return { state: "stale", ageMs, limitMs: MAX_SNAPSHOT_AGE_MS }
  return { state: "fresh", ageMs, limitMs: MAX_SNAPSHOT_AGE_MS }
}
