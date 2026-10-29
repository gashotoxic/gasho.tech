// GitHub API utility for persisting blog data across Vercel deploys
// Uses GH_TOKEN env var to commit changes to data/blogs.json

import type { BlogPostShape } from "./blog-post-update.ts"

const GITHUB_TOKEN = process.env.GH_TOKEN
const REPO_OWNER = "gashotoxic"
const REPO_NAME = "gasho.tech"
const BRANCH = "main"
const FILE_PATH = "data/blogs.json"

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

export async function commitBlogChanges(
  content: string,
  commitMessage: string,
  expectedSha?: string
): Promise<GitHubCommitResult> {
  if (!GITHUB_TOKEN) {
    return { success: false, error: "GH_TOKEN not set" }
  }

  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`

  try {
    // Step 1: Get current file SHA.
    // A caller that just read the file passes the SHA it read, so a commit that
    // lands in between fails loudly (409) instead of being silently overwritten.
    let currentSha: string | undefined = expectedSha

    if (!currentSha) {
      const getRes = await fetch(`${apiUrl}?ref=${BRANCH}`, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      })

      // 404 = the file does not exist yet, so this PUT creates it (no `sha`).
      // Any other failure is reported instead of guessed at.
      if (getRes.status !== 404) {
        if (!getRes.ok) {
          return {
            success: false,
            error: `Failed to fetch current file: ${getRes.status}`,
            status: getRes.status,
          }
        }
        currentSha = (await getRes.json()).sha as string
      }
    }

    // Step 2: Commit updated content
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
        sha: currentSha,
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
    !/[?#\\]/.test(filePath)
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
