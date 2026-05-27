// GitHub API utility for persisting blog data across Vercel deploys
// Uses GH_TOKEN env var to commit changes to data/blogs.json

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
}

export async function commitBlogChanges(
  content: string,
  commitMessage: string
): Promise<GitHubCommitResult> {
  if (!GITHUB_TOKEN) {
    return { success: false, error: "GH_TOKEN not set" }
  }

  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`

  try {
    // Step 1: Get current file SHA
    const getRes = await fetch(`${apiUrl}?ref=${BRANCH}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!getRes.ok) {
      return { success: false, error: `Failed to fetch current file: ${getRes.status}` }
    }

    const currentFile = await getRes.json()
    const currentSha = currentFile.sha

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

export async function commitImage(
  imageData: string,
  filePath: string,
  commitMessage: string
): Promise<GitHubCommitResult> {
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
