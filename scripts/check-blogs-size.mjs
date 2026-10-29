#!/usr/bin/env node
/**
 * How much of GitHub's size ceiling `data/blogs.json` is using.
 *
 * Why this exists: past 1 MB the GitHub *contents* API stops returning a file's
 * body (metadata only, `content: ""`), and past 100 MB it refuses the file
 * outright. The read path (`lib/github.ts`) now handles the 1–100 MB range by
 * fetching the body from the Git blobs endpoint, and fails loudly above 100 MB —
 * but the honest answer to "are we close?" should be available *before* a publish
 * returns 500, which is what this prints.
 *
 * Exit 0 below 80% of the ceiling, 0 with a WARN line at/above 80%, 1 past the
 * ceiling (where writes cannot work at all). Run: `npm run check:blogs-size`.
 */

import { readFileSync } from "node:fs"
import { BLOG_FILE_MAX_BYTES, BLOG_FILE_WARN_BYTES } from "../lib/github.ts"

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
console.log(`  ceiling: ${mb(BLOG_FILE_MAX_BYTES)} — used ${used.toFixed(2)}%, ~${postsUntilCeiling} more posts of headroom`)

if (bytes > BLOG_FILE_MAX_BYTES) {
  console.error(
    `FAIL: past GitHub's ${mb(BLOG_FILE_MAX_BYTES)} ceiling — the contents and blobs APIs cannot read it, ` +
      `so every blog write fails. Split the archive into data/blogs/<slug>.json.`
  )
  process.exit(1)
}

if (bytes >= BLOG_FILE_WARN_BYTES) {
  console.warn(
    `WARN: at ${used.toFixed(1)}% of the ceiling (~${postsUntilCeiling} posts left). ` +
      `Plan the per-post split (data/blogs/<slug>.json) before it is urgent.`
  )
}
