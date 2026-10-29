// GitHub API utility for persisting blog data across Vercel deploys
// Uses GH_TOKEN env var to commit changes to data/blogs.json

import { createHash } from "node:crypto"
import type { BlogPostShape } from "./blog-post-update.ts"

const GITHUB_TOKEN = process.env.GH_TOKEN
const REPO_OWNER = "gashotoxic"
const REPO_NAME = "gasho.tech"
const BRANCH = "main"
const FILE_PATH = "data/blogs.json"

/**
 * Upper bound on a GitHub API call.
 *
 * The blog read sits on a public page render, so a hung upstream must fail (and
 * fall back to the deployed snapshot) instead of holding the request open until
 * the platform kills it. Writes get their own, longer bound: they are behind an
 * admin action and carry the whole archive or a hero image, so 8 seconds is too
 * tight — but unbounded was the bug, and every write call below names a signal.
 */
const REQUEST_TIMEOUT_MS = 8000
const WRITE_TIMEOUT_MS = 30000

/** Every call below is for this one repository. */
const REPO_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`

/**
 * The size ceiling on `data/blogs.json` — and it is not the 1 MB one people
 * remember. GitHub's rules for the contents endpoint:
 *
 * - **≤ 1 MB** — the body comes back inline (base64) in one request.
 * - **1–100 MB** — metadata only: `sha` and `size` are there, but `content` is
 *   `""` and `encoding` is `"none"`. The body has to come from the Git blobs
 *   endpoint, addressed by that sha.
 * - **> 100 MB** — the endpoint is not supported at all. Nothing can read the
 *   archive: every write 500s permanently and `GET /api/blogs` quietly serves the
 *   deployed snapshot while admin edits fail.
 *
 * The archive was 565 KB / 73 posts when this was written: 62 posts of headroom
 * against the *old* 1 MB assumption, which is why the real ceiling is worth
 * naming now rather than discovering it a year from now. This constant turns that
 * into a named failure with a fix in the message instead of a mystery 500.
 */
export const BLOG_FILE_MAX_BYTES = 100 * 1024 * 1024
export const BLOG_FILE_WARN_BYTES = Math.floor(BLOG_FILE_MAX_BYTES * 0.8)

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

/**
 * Raised when `data/blogs.json` is past the point GitHub will serve it. The
 * message names the size, the ceiling and the actual remedy, because the failure
 * this replaces is an empty `content` field on a 200 and a JSON syntax error four
 * frames deep in the read.
 */
export class BlogFileTooLargeError extends Error {
  constructor(bytes: number, limit: number = BLOG_FILE_MAX_BYTES) {
    super(
      `data/blogs.json is ${formatBytes(bytes)}, over GitHub's ${formatBytes(limit)} ceiling: the contents and ` +
        `blobs APIs cannot read a file that large, so every blog write would fail permanently. ` +
        `Split the archive into one file per post (data/blogs/<slug>.json) — readers to update: lib/blogs.ts, ` +
        `app/sitemap.ts, app/feed.xml/route.ts, app/llms*.txt, the studio and the admin page.`
    )
    this.name = "BlogFileTooLargeError"
  }
}

/**
 * One warning per process is enough: above 80% of the ceiling every read hits
 * this branch, and a log line per request would bury the one that matters.
 */
let warnedAboutArchiveSize = false

interface GitHubCommitResult {
  success: boolean
  sha?: string
  url?: string
  error?: string
  /** HTTP status from the API when the write failed (409 = sha conflict). */
  status?: number
}

export interface BlogFileSnapshot {
  posts: BlogPostShape[]
  sha?: string
  /** True when `data/blogs.json` does not exist yet (first ever publish). */
  missing?: boolean
}

/**
 * A read that a write may act on: the file exists and the exact blob sha it was
 * read at is known.
 *
 * The sha is not optional here, and that is the point. `commitBlogChanges` needs
 * one, and a caller that read nothing usable has nothing to pin — so "I could not
 * read the archive, let me write anyway" cannot be expressed with this type.
 */
export interface WritableBlogFile {
  posts: BlogPostShape[]
  sha: string
}

/** Raised when the repository has no `data/blogs.json` to write over. */
export class MissingBlogFileError extends Error {
  constructor(message = "data/blogs.json was not found in the repository; refusing to write") {
    super(message)
    this.name = "MissingBlogFileError"
  }
}

/**
 * Read the live `data/blogs.json` from the repository — the source of truth for
 * anything that rewrites the file (the deployed copy is a build-time snapshot).
 *
 * Throws when the file cannot be read; callers that write MUST NOT fall back to
 * an empty list, because publishing on top of an unknown post list is how one
 * publish destroys every other post.
 */
export async function readBlogFile(): Promise<BlogFileSnapshot> {
  if (!GITHUB_TOKEN) {
    throw new Error("GH_TOKEN not set")
  }

  const res = await fetch(`${REPO_API}/contents/${FILE_PATH}?ref=${BRANCH}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
    // The read path is on a public page render, so a hung upstream must fail
    // (and fall back) instead of holding the request open until the platform
    // times it out.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  // A missing file is a legitimate empty archive (first ever publish).
  if (res.status === 404) return { posts: [], missing: true }
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`)

  const file = await res.json()

  // The size guard runs before a body is asked for. Past the ceiling the contents
  // API still answers 200 — with an empty `content` — so the failure it prevents is
  // silent, and its fix is a different piece of work. Say which one it is.
  const size = typeof file.size === "number" ? file.size : undefined
  if (size !== undefined) {
    if (size > BLOG_FILE_MAX_BYTES) throw new BlogFileTooLargeError(size)
    if (size >= BLOG_FILE_WARN_BYTES && !warnedAboutArchiveSize) {
      warnedAboutArchiveSize = true
      console.warn(
        `data/blogs.json is ${formatBytes(size)} — ${Math.round((size / BLOG_FILE_MAX_BYTES) * 100)}% of the ` +
          `${formatBytes(BLOG_FILE_MAX_BYTES)} ceiling at which GitHub stops serving it. ` +
          `Split the archive before it gets there (see scripts/check-blogs-size.mjs).`
      )
    }
  }

  const raw = await readBlogFileBody(file, size)

  const parsed = JSON.parse(raw) as unknown
  const posts = Array.isArray(parsed)
    ? parsed
    : (parsed as { posts?: unknown } | null)?.posts

  if (!Array.isArray(posts)) {
    throw new Error("data/blogs.json does not contain a post list")
  }

  return { posts: posts as BlogPostShape[], sha: file.sha }
}

/**
 * The body of `data/blogs.json`, from the metadata the contents call returned.
 *
 * Up to 1 MB the body is inline and this stays one request — deliberately, since
 * this read sits on every public page render.
 *
 * A larger file comes back as metadata only (`content: ""`, `encoding: "none"`)
 * and its body is fetched from the Git blobs endpoint *by the sha the metadata
 * read reported*. That is what makes the two-call read safe: a blob sha names one
 * immutable version, so the body cannot be a newer file than the sha a write
 * pins. (The `raw` media type returns the body with no sha at all, which is why
 * the body comes from the blob instead.) The sha GitHub reports for a file *is*
 * the git blob id, so the bytes are checked against it rather than trusted.
 */
async function readBlogFileBody(
  file: { content?: unknown; encoding?: unknown; sha?: unknown },
  size?: number
): Promise<string> {
  if (file.encoding === "base64" && typeof file.content === "string" && file.content.length > 0) {
    const inline = Buffer.from(file.content, "base64").toString("utf-8")
    assertBodySize(inline, size)
    return inline
  }

  // No body and no sha: nothing to fetch, and nothing a write could be pinned to.
  // Returning "" here is how an empty archive gets written over the real one.
  if (typeof file.sha !== "string" || !file.sha) {
    throw new Error("data/blogs.json was read without a body and without a blob sha")
  }

  // The sha is interpolated into the blob URL, so it has to be a sha and nothing
  // else: `x/../../rate_limit` or `x?per_page=1` would otherwise steer a request
  // that carries the token to a different endpoint on api.github.com.
  if (!/^[0-9a-f]{40}$/i.test(file.sha)) {
    throw new Error("data/blogs.json was read with a malformed blob sha")
  }

  // This branch exists because the file is large. Without the size GitHub reported
  // there is no ceiling to hold the fetch to, so fail closed rather than pull an
  // unbounded body through the public read path.
  if (typeof size !== "number" || !Number.isFinite(size)) {
    throw new Error("data/blogs.json was read without a size; refusing to fetch its body unbounded")
  }

  const res = await fetch(`${REPO_API}/git/blobs/${file.sha}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`GitHub blob read failed: ${res.status}`)

  const blob = await res.json()
  if (blob.sha !== file.sha) {
    // A body that is not the version the metadata named would be published on top
    // of, and then committed over, a list it never read.
    throw new Error("GitHub returned a blob that is not the version data/blogs.json was read at")
  }
  if (blob.encoding !== "base64" || typeof blob.content !== "string" || !blob.content) {
    throw new Error("GitHub returned no body for data/blogs.json")
  }

  const bytes = Buffer.from(blob.content, "base64")
  const raw = bytes.toString("utf-8")

  // A truncated base64 body still decodes to *something*.
  assertBodySize(raw, size)

  // ...and a body can echo the requested `sha` field while holding other bytes, so
  // the content itself has to match its own address. The sha for a file is its git
  // blob id; recomputing it is the difference between "GitHub said so" and "these
  // are the bytes that sha names" — and a list from the former, written back with
  // the metadata sha pinned, would overwrite the real archive.
  if (gitBlobSha(bytes) !== file.sha.toLowerCase()) {
    throw new Error("data/blogs.json body does not hash to the sha it was read at")
  }

  return raw
}

/** The git blob id of these bytes — what the contents API reports as a file's `sha`. */
function gitBlobSha(bytes: Buffer): string {
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, "utf-8"), bytes]))
    .digest("hex")
}

/** Refuse a body whose decoded size is not the size GitHub reported. */
function assertBodySize(raw: string, size?: number): void {
  if (size === undefined) return
  const actual = Buffer.byteLength(raw, "utf-8")
  if (actual !== size) {
    throw new Error(`data/blogs.json read as ${actual} bytes but GitHub reported ${size}`)
  }
}

/**
 * Read the live archive for a write.
 *
 * This is the write-facing sibling of `readBlogFile()`, and the only read a
 * mutation may use. `readBlogFile()` offers a 404 as `{ posts: [], missing: true }`
 * so a first-ever publish can create the file; a *write over an existing archive*
 * must never read that as "the archive is empty". A 404 there means a bad ref, a
 * token without access, or an outage, and trusting it commits one post on top of
 * the 73 that were not read — with no sha to protect the rest.
 *
 * It throws instead, which every store turns into a refusal (`read-failed`) with
 * nothing written. `/api/blogs` and `/api/studio/publish` both come through here,
 * so the refusal cannot drift back into one route and not the other.
 */
export async function readBlogFileForWrite(): Promise<WritableBlogFile> {
  const snapshot = await readBlogFile()
  if (snapshot.missing) throw new MissingBlogFileError()
  if (typeof snapshot.sha !== "string" || !snapshot.sha) {
    // A 200 without a blob sha is not something a write can be pinned to.
    throw new Error("data/blogs.json was read without a blob sha; refusing to write")
  }
  return { posts: snapshot.posts, sha: snapshot.sha }
}

/**
 * Commit `content` to `data/blogs.json` on top of the blob `expectedSha` names.
 *
 * The sha is required. It used to be optional, and the fallback — read the sha
 * again, just before writing — turned a read-then-write into a blind write: the
 * list was read at one sha and committed against another, so the commit
 * succeeded over whatever had landed in between. Callers read first
 * (`readBlogFileForWrite`) and pin what they read; a concurrent commit then
 * fails with 409 instead of being overwritten.
 */
export async function commitBlogChanges(
  content: string,
  commitMessage: string,
  expectedSha: string
): Promise<GitHubCommitResult> {
  if (!GITHUB_TOKEN) {
    return { success: false, error: "GH_TOKEN not set" }
  }

  if (typeof expectedSha !== "string" || !expectedSha) {
    // Defence in depth for JS callers: a commit that names no base can only be
    // an accident, and any accident here overwrites the archive.
    return { success: false, error: "Refusing to commit without the sha the file was read at" }
  }

  const contentBytes = Buffer.byteLength(content, "utf-8")
  if (contentBytes > BLOG_FILE_MAX_BYTES) {
    // The read refuses first (it cannot fetch a body that large), so getting here
    // means the content grew past the ceiling inside this process. Same named
    // failure rather than a 413 with no explanation.
    return { success: false, error: new BlogFileTooLargeError(contentBytes).message }
  }

  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`

  try {
    // One request, and it names the base it was built on. If the file moved
    // since, GitHub answers 409 and nothing is lost.
    const commitRes = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(content).toString("base64"),
        sha: expectedSha,
        branch: BRANCH,
      }),
      // A write is an admin action, not a page render: it gets a longer bound,
      // never no bound.
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    })

    if (!commitRes.ok) {
      const err = await commitRes.text()
      return {
        success: false,
        error: `Commit failed: ${commitRes.status} - ${err}`,
        status: commitRes.status,
      }
    }

    const result = await commitRes.json()
    return {
      success: true,
      sha: result.content?.sha,
      url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${result.commit?.sha}`,
    }
  } catch (err) {
    return { success: false, error: `Exception: ${err}` }
  }
}

/**
 * Every path this module writes or deletes must live under the blog image
 * directory: the value reaches the GitHub contents API as a repository path, so
 * a traversal or a stray query/backslash is refused here even though today's
 * only caller builds it from a normalised slug. Defence in depth — the guard
 * lives next to the write, not next to the caller.
 *
 * Writes only ever target files this process is about to create, so the stricter
 * rule is safe: query strings and fragments are refused here. Note that a *stored*
 * post may legitimately carry one (`/images/<slug>.webp?v=3`, five posts do), so a
 * caller must never feed a stored image value straight back into a write — strip
 * the query first. The read-side guard (`isSafeImagePath` in the publish route)
 * accepts a query string for exactly that reason.
 */
const WRITABLE_IMAGE_ROOT = "public/images/blog/"

export function isWritableImagePath(filePath: unknown): boolean {
  return (
    typeof filePath === "string" &&
    filePath.startsWith(WRITABLE_IMAGE_ROOT) &&
    filePath.length > WRITABLE_IMAGE_ROOT.length &&
    !filePath.includes("..") &&
    // `%` as well as `?#\\`: a percent-encoded `%2e%2e` is still a traversal to
    // anything that decodes the path before using it, and no real image path in
    // this repository contains one.
    !/[?#\\%]/.test(filePath)
  )
}

/**
 * Remove a file this process just committed.
 *
 * A publish commits the hero image before the post list (the post must not point
 * at a file that does not exist yet). When the post write is then rejected, the
 * image commit is left on `main` with nothing referencing it — the route calls
 * this to undo its own write. The caller passes the blob sha it wrote, so a
 * concurrent change to the same path fails (409) instead of being deleted.
 */
export async function deleteImage(
  filePath: string,
  sha: string,
  commitMessage: string
): Promise<GitHubCommitResult> {
  if (!isWritableImagePath(filePath)) {
    return { success: false, error: `Refusing to delete outside ${WRITABLE_IMAGE_ROOT}: ${filePath}` }
  }

  if (!GITHUB_TOKEN) {
    return { success: false, error: "GH_TOKEN not set" }
  }

  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`

  try {
    const deleteRes = await fetch(apiUrl, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: commitMessage, sha, branch: BRANCH }),
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    })

    if (!deleteRes.ok) {
      const err = await deleteRes.text()
      return {
        success: false,
        error: `Delete failed: ${deleteRes.status} - ${err}`,
        status: deleteRes.status,
      }
    }

    const result = await deleteRes.json()
    return {
      success: true,
      url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${result.commit?.sha}`,
    }
  } catch (err) {
    return { success: false, error: `Exception: ${err}` }
  }
}

/**
 * Commit a base64 image to the repository (hero images under `public/images`).
 *
 * The path is validated here as well as by the caller: it becomes a repository
 * path, so it must never be built from unvalidated input.
 */
export async function commitImage(
  imageData: string,
  filePath: string,
  commitMessage: string
): Promise<GitHubCommitResult> {
  if (!isWritableImagePath(filePath)) {
    return { success: false, error: `Refusing to write outside ${WRITABLE_IMAGE_ROOT}: ${filePath}` }
  }

  if (!GITHUB_TOKEN) {
    return { success: false, error: "GH_TOKEN not set" }
  }

  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`

  try {
    const getRes = await fetch(`${apiUrl}?ref=${BRANCH}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    let currentSha: string
    if (getRes.ok) {
      const currentFile = await getRes.json()
      currentSha = currentFile.sha
    } else if (getRes.status === 404) {
      currentSha = ""
    } else {
      return { success: false, error: `Failed to check file: ${getRes.status}` }
    }

    const commitData = {
      message: commitMessage,
      content: imageData,
      sha: currentSha,
      branch: BRANCH,
    }

    const commitRes = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commitData),
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    })

    if (!commitRes.ok) {
      const err = await commitRes.text()
      return { success: false, error: `Commit failed: ${commitRes.status} - ${err}` }
    }

    const result = await commitRes.json()
    return {
      success: true,
      sha: result.content?.sha,
      url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/commit/${result.commit?.sha}`,
    }
  } catch (err) {
    return { success: false, error: `Exception: ${err}` }
  }
}
