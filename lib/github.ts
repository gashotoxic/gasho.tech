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
 * Upper bound on a GitHub API call that does not move a blob.
 *
 * The blog read sits on a public page render, so a hung upstream must fail (and
 * fall back to the deployed snapshot) instead of holding the request open until
 * the platform kills it. Writes get their own, longer bound: they are behind an
 * admin action and carry the whole archive or a hero image, so 8 seconds is too
 * tight — but unbounded was the bug, and every write call below names a signal.
 *
 * A blob *body* is a third case: its cost scales with the file, so it gets a
 * budget derived from `size` (see `blobFetchBudgetMs`) instead of this constant.
 */
const REQUEST_TIMEOUT_MS = 8000
const WRITE_TIMEOUT_MS = 30000

/**
 * Measured throughput floor for a blob body, in bytes per second.
 *
 * Measured from this box: a 4.8 MB blob came back in 4.3 s, i.e. ~1.1 MB/s. The
 * floor sits just under that, so a size-derived budget is generous on a normal
 * link and still bounded on a slow one. A blob comes from the same region as the
 * metadata that named it, so this is throughput, not distance.
 */
const BLOB_BYTES_PER_SEC_FLOOR = 1 * 1024 * 1024

/**
 * Ceiling on any single blob fetch, however large the file.
 *
 * A public render waiting longer than this is indistinguishable from the outage
 * the snapshot fallback exists for, and the platform would cut it off anyway.
 * With `BLOG_FILE_MAX_BYTES` at 20 MB the derived budget stays under it, so this
 * is the backstop, not the common bound.
 */
const BLOB_MAX_TIMEOUT_MS = 30000

/**
 * How many milliseconds a blob body of `size` bytes is allowed.
 *
 * The old rule — one flat 8 s for every fetch — meant the 100 MB guard could
 * never be reached: a 4.8 MB blob already took 4.3 s here, so anything past
 * ~10 MB aborted as a bare `AbortError` ("GitHub blob read failed") while the
 * guard still claimed the file was fine. A timeout that scales with the bytes
 * makes the guard the thing that fails first, and its message is the useful one.
 */
export function blobFetchBudgetMs(size: number): number {
  if (!Number.isFinite(size) || size <= 0) return REQUEST_TIMEOUT_MS
  const transfer = Math.ceil((size / BLOB_BYTES_PER_SEC_FLOOR) * 1000)
  return Math.min(BLOB_MAX_TIMEOUT_MS, REQUEST_TIMEOUT_MS + transfer)
}

/** Every call below is for this one repository. */
const REPO_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`

/**
 * Where GitHub stops serving `data/blogs.json` inline, and where this process
 * stops being willing to read it.
 *
 * GitHub's rules for the contents endpoint:
 *
 * - **≤ 1 MB** — the body comes back inline (base64) in one request.
 * - **1–100 MB** — metadata only: `sha` and `size` are there, but `content` is
 *   `""` and `encoding` is `"none"`. The body has to come from the Git blobs
 *   endpoint, addressed by that sha.
 * - **> 100 MB** — the endpoint is not supported at all. Nothing can read the
 *   archive: every write 500s permanently and `GET /api/blogs` quietly serves the
 *   deployed snapshot while admin edits fail.
 *
 * `BLOG_FILE_MAX_BYTES` is deliberately **not** GitHub's 100 MB. It is what this
 * process can decode: a body costs roughly 5–6× its size at peak (the base64
 * response string, the decoded `Buffer`, the utf-8 string, and the copy inside
 * `gitBlobSha`), so a 100 MB blob is ~500 MB of heap and OOMs a 1 GB serverless
 * function before any guard here fires. 20 MB is ~120 MB of peak heap — safe
 * with room for the request that is doing it — and far past the ~565 KB the
 * archive actually is. Past this the failure is named, and the fix is in the
 * message, instead of a mystery 500 or an OOM.
 */
export const BLOG_FILE_CONTENTS_INLINE_MAX_BYTES = 1024 * 1024
export const BLOG_FILE_MAX_BYTES = 20 * 1024 * 1024

/**
 * The two edges worth an alarm, because they are the two real transitions:
 *
 * - `BLOG_FILE_CONTENTS_INLINE_MAX_BYTES` (1 MB) — reads become **two** requests
 *   to two different endpoints, on every public render.
 * - `BLOG_FILE_CEILING_WARN_BYTES` (80% of the ceiling) — there is no room left
 *   to publish; the next few posts end the blog.
 *
 * `BLOG_FILE_WARN_BYTES` is the operational one. It used to be 80% of 100 MB (80
 * MB), which no archive will ever reach before something else breaks, so it
 * never fired and the comment that claimed "above 80% of the ceiling every read
 * hits this branch" described a boundary nobody was near.
 */
export const BLOG_FILE_WARN_BYTES = 2 * 1024 * 1024
export const BLOG_FILE_CEILING_WARN_BYTES = Math.floor(BLOG_FILE_MAX_BYTES * 0.8)


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
      `data/blogs.json is ${formatBytes(bytes)}, over this app's ${formatBytes(limit)} ceiling: reading a body ` +
        `that large costs roughly ${formatBytes(bytes * 6)} of heap at peak (base64 body, decoded buffer, utf-8 ` +
        `string and the hash copy), which OOMs a 1 GB serverless function before the guard fires — and GitHub ` +
        `stops serving anything past 100 MB outright. ` +
        `Split the archive into one file per post (data/blogs/<slug>.json) — readers to update: lib/blogs.ts, ` +
        `app/sitemap.ts, app/feed.xml/route.ts, app/llms*.txt, the studio and the admin page.`
    )
    this.name = "BlogFileTooLargeError"
  }
}

/**
 * Raised when the blob body did not arrive inside its size-derived budget.
 *
 * A bare `AbortError` here read as "GitHub blob read failed" and every caller
 * treated it as a transient outage — the public path quietly served the deployed
 * snapshot, and an admin publish said "try again" forever. It is not transient:
 * the file is bigger than this process can fetch in time, and the remedy is the
 * same split as `BlogFileTooLargeError`.
 */
export class BlogFileFetchTimeoutError extends Error {
  constructor(bytes: number, budgetMs: number, cause?: unknown) {
    super(
      `data/blogs.json is ${formatBytes(bytes)} and did not finish downloading within ${Math.round(budgetMs / 1000)}s ` +
        `(a ~1 MB/s floor plus request overhead). That is a file this app cannot read reliably, not a passing ` +
        `GitHub outage — split the archive into data/blogs/<slug>.json.`
    )
    this.name = "BlogFileFetchTimeoutError"
    this.cause = cause
  }
}

/**
 * Raised for a `data/blogs.json` that exists and is 0 bytes.
 *
 * It used to fall through the "is there an inline body?" check into the blob
 * branch, which reported "GitHub returned no body for data/blogs.json" — true,
 * but it names GitHub as the problem when the file itself is empty. A named
 * condition points at the file.
 */
export class BlogFileEmptyError extends Error {
  constructor() {
    super(
      "data/blogs.json is empty (0 bytes), so there is no post list to read. " +
        "Nothing was written; restore the file from git history."
    )
    this.name = "BlogFileEmptyError"
  }
}

/**
 * One warning per edge per process is enough: a log line per request would bury
 * the one that matters, and both of these edges hold for every read until the
 * archive shrinks or is split. Exported reset is for tests — the state is
 * module-level, so a suite that asserts on the warning has to be able to clear it.
 */
let warnedAboutTwoRequestEdge = false
let warnedAboutArchiveCeiling = false

/** Forget the once-per-process warnings (tests only). */
export function resetArchiveSizeWarnings(): void {
  warnedAboutTwoRequestEdge = false
  warnedAboutArchiveCeiling = false
}


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
    warnAboutArchiveSize(size)
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
 * Say, once per process per edge, that the archive crossed one of the two
 * boundaries that actually change how reads work.
 *
 * Both edges are real transitions rather than arbitrary percentages: 1 MB is
 * where the contents API stops returning a body (every read becomes two
 * requests), and 80% of the ceiling is where publishing has no room left. The
 * old single threshold — 80% of 100 MB — sat at a size the archive will never
 * reach, so it could not warn about anything.
 */
export function warnAboutArchiveSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0) return

  if (size >= BLOG_FILE_CEILING_WARN_BYTES && !warnedAboutArchiveCeiling) {
    warnedAboutArchiveCeiling = true
    console.warn(
      `data/blogs.json is ${formatBytes(size)} — ${Math.round((size / BLOG_FILE_MAX_BYTES) * 100)}% of the ` +
        `${formatBytes(BLOG_FILE_MAX_BYTES)} ceiling at which this app stops reading it (only ` +
        `${formatBytes(Math.max(0, BLOG_FILE_MAX_BYTES - size))} of publishing room left). ` +
        `Split the archive into data/blogs/<slug>.json now (see scripts/check-blogs-size.mjs).`
    )
  }

  if (size >= BLOG_FILE_WARN_BYTES && !warnedAboutTwoRequestEdge) {
    warnedAboutTwoRequestEdge = true
    console.warn(
      `data/blogs.json is ${formatBytes(size)} — past GitHub's ` +
        `${formatBytes(BLOG_FILE_CONTENTS_INLINE_MAX_BYTES)} inline ceiling, so every public read is now two ` +
        `requests (contents metadata + git blob) instead of one. Nothing is broken; this is the operating ` +
        `cost worth seeing before it grows. Split the archive into data/blogs/<slug>.json when convenient ` +
        `(see scripts/check-blogs-size.mjs).`
    )
  }
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
  // A 0-byte file answers with `content: ""` and `encoding: "base64"` (or
  // `"none"`), and used to fall through to the blob branch — where it was
  // rejected as "GitHub returned no body". The file is the problem, so say that.
  if (size === 0) throw new BlogFileEmptyError()

  if (file.encoding === "base64" && typeof file.content === "string" && file.content.length > 0) {
    const bytes = Buffer.from(file.content, "base64")
    // The inline branch holds itself to the same rule as the blob branch: a body
    // whose reported size is missing is refused rather than trusted, and the byte
    // count is compared against the decoded buffer, not a re-measured string.
    assertBodySize(bytes, size, "inline")
    return bytes.toString("utf-8")
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

  // The budget scales with the body: one flat bound made this fetch the thing
  // that failed first for any file past ~10 MB, as a bare AbortError that every
  // caller read as a transient outage.
  const budgetMs = blobFetchBudgetMs(size)

  let res: Response
  try {
    res = await fetch(`${REPO_API}/git/blobs/${file.sha}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
      signal: AbortSignal.timeout(budgetMs),
    })
  } catch (error) {
    if (isTimeoutError(error)) throw new BlogFileFetchTimeoutError(size, budgetMs, error)
    throw error
  }
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
  assertBodySize(bytes, size, "blob")

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

/**
 * Did this fetch reject because its `AbortSignal.timeout` fired?
 *
 * Node throws a `DOMException` named `TimeoutError` for a timed-out signal, and
 * older runtimes (and some polyfills) throw `AbortError` — both mean the same
 * thing here, and neither is an HTTP status we can read.
 */
function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const name = (error as { name?: unknown }).name
  return name === "TimeoutError" || name === "AbortError"
}

/** The git blob id of these bytes — what the contents API reports as a file's `sha`. */
function gitBlobSha(bytes: Buffer): string {
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, "utf-8"), bytes]))
    .digest("hex")
}

/**
 * Refuse a body whose decoded size is not the size GitHub reported.
 *
 * Compares the decoded `Buffer` — the bytes that were actually transferred —
 * instead of `Buffer.byteLength(raw, "utf-8")`, which re-encodes the string and
 * measures an intermediate artefact rather than the body. `context` names which
 * branch failed, because "inline" and "blob" mean different things when reading
 * the log.
 */
function assertBodySize(bytes: Buffer, size: number | undefined, context: "inline" | "blob"): void {
  if (typeof size !== "number" || !Number.isFinite(size)) {
    // Both branches fail closed. The blob branch has no ceiling to hold an
    // unbounded fetch to; the inline branch has no way to tell a complete body
    // from a truncated one, and a truncated post list parses more often than it
    // looks like it should.
    throw new Error(
      `data/blogs.json was read from the ${context} body without a reported size; refusing to trust it`
    )
  }
  if (bytes.length !== size) {
    throw new Error(`data/blogs.json read as ${bytes.length} bytes but GitHub reported ${size}`)
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
