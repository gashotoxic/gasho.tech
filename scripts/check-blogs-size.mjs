#!/usr/bin/env node
/**
 * How much of the archive's size budget `data/blogs.json` is using.
 *
 * Why this exists: past 1 MB the GitHub *contents* API stops returning a file's
 * body (metadata only, `content: ""`), so every read becomes two requests; past
 * `BLOG_FILE_MAX_BYTES` (20 MB — what a 1 GB serverless function can decode
 * without OOMing, not GitHub's 100 MB hard limit) this app refuses to read the
 * file at all and every blog write fails.
 *
 * The read path (`lib/github.ts`) handles the 1–20 MB range by fetching the body
 * from the Git blobs endpoint with a size-derived timeout, and fails loudly
 * above the ceiling — but the honest answer to "are we close?" should be
 * available *before* a publish returns 500, which is what this prints.
 *
 * Exit 0 below the ceiling, 0 with a WARN line at either edge (the 1 MB
 * two-request edge, or 80% of the ceiling), 1 past the ceiling (where nothing
 * can be read or written). Run: `npm run check:blogs-size`.
 */

import { readFileSync } from "node:fs"
import {
  BLOG_FILE_CONTENTS_INLINE_MAX_BYTES,
  BLOG_FILE_MAX_BYTES,
  BLOG_FILE_WARN_BYTES,
  BLOG_FILE_CEILING_WARN_BYTES,
} from "../lib/github.ts"

const FILE = new URL("../data/blogs.json", import.meta.url)

function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const buffer = readFileSync(FILE)
const bytes = buffer.byteLength

let posts = []
try {
  const parsed = JSON.parse(buffer.toString("utf-8"))
  posts = Array.isArray(parsed) ? parsed : (parsed?.posts ?? [])
} catch (error) {
  console.error(`data/blogs.json is not valid JSON: ${error.message}`)
  process.exit(1)
}

if (!Array.isArray(posts)) {
  console.error("data/blogs.json does not contain a post list")
  process.exit(1)
}

const average = posts.length > 0 ? bytes / posts.length : 0
const used = (bytes / BLOG_FILE_MAX_BYTES) * 100
const headroom = BLOG_FILE_MAX_BYTES - bytes
const postsUntilCeiling = average > 0 ? Math.floor(headroom / average) : 0

console.log(`data/blogs.json: ${bytes.toLocaleString()} bytes (${mb(bytes)}) in ${posts.length} posts`)
console.log(`  average per post: ${Math.round(average).toLocaleString()} bytes`)
console.log(
  `  inline ceiling (one request): ${mb(BLOG_FILE_CONTENTS_INLINE_MAX_BYTES)} — ` +
    (bytes > BLOG_FILE_CONTENTS_INLINE_MAX_BYTES ? "exceeded, every read is two requests" : "under")
)
console.log(
  `  read ceiling (this app): ${mb(BLOG_FILE_MAX_BYTES)} — used ${used.toFixed(2)}%, ` +
    `~${postsUntilCeiling} more posts of headroom`
)

if (bytes > BLOG_FILE_MAX_BYTES) {
  console.error(
    `FAIL: past the ${mb(BLOG_FILE_MAX_BYTES)} read ceiling — this app refuses to decode a file that large ` +
      `(and GitHub stops serving bodies past 100 MB outright), so every blog read and write fails. ` +
      `Split the archive into data/blogs/<slug>.json.`
  )
  process.exit(1)
}

if (bytes >= BLOG_FILE_CEILING_WARN_BYTES) {
  console.warn(
    `WARN: at ${used.toFixed(1)}% of the ${mb(BLOG_FILE_MAX_BYTES)} ceiling (~${postsUntilCeiling} posts left). ` +
      `Split the archive into data/blogs/<slug>.json now, not after it stops.`
  )
} else if (bytes >= BLOG_FILE_WARN_BYTES) {
  console.warn(
    `WARN: ${mb(bytes)} — past the ${mb(BLOG_FILE_CONTENTS_INLINE_MAX_BYTES)} inline ceiling, so every public ` +
      `read is two requests (contents metadata + git blob). Nothing is broken; schedule the per-post split ` +
      `(data/blogs/<slug>.json) while it is still cheap.`
  )
}
