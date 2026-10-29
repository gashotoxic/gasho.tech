// GitHub API utility for persisting blog data across Vercel deploys
// Uses GH_TOKEN env var to commit changes to data/blogs.json

import type { BlogPostShape } from "./blog-post-update.ts"

const GITHUB_TOKEN = process.env.GH_TOKEN
const REPO_OWNER = "gashotoxic"
const REPO_NAME = "gasho.tech"
const BRANCH = "main"
const FILE_PATH = "data/blogs.json"

/**
 * Upper bound on a GitHub API call. The blog read sits on a public page render
 * and the writes sit behind an admin action, so a hung upstream must fail loudly
 * instead of holding a request open until the platform kills it.
 */
const REQUEST_TIMEOUT_MS = 8000

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

  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`
  const res = await fetch(`${apiUrl}?ref=${BRANCH}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
    // The read path is on a public page render, so a hung upstream must fail
    // (and fall back) instead of holding the request open until the platform
    // times it out. Writes get the same bound and report the failure honestly.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  // A missing file is a legitimate empty archive (first ever publish).
  if (res.status === 404) return { posts: [], missing: true }
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status}`)

  const file = await res.json()
  const encoded = typeof file.content === "string" ? file.content : ""
  const raw =
    file.encoding === "base64"
      ? Buffer.from(encoded, "base64").toString("utf-8")
      : encoded

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
