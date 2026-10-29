import { promises as fs } from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { buildNewPost, normalizeSlug, type BlogPostShape } from "@/lib/blog-post-update"
import { commitBlogChanges, readBlogFile } from "@/lib/github"
import {
  deletePostFromStore,
  publicPosts,
  publishPostToStore,
  updatePostInStore,
  type PostStore,
  type StoreFailure,
} from "@/lib/blog-publish"

const DATA_FILE = path.join(process.cwd(), "data", "blogs.json")

type BlogPost = BlogPostShape

function checkAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false
  return verifyToken(authHeader.slice(7))
}

/** The copy shipped with the build. Read-only on Vercel, and only ever a fallback. */
async function readSnapshotPosts(): Promise<BlogPost[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8")
    const parsed = JSON.parse(raw) as { posts?: unknown }
    return Array.isArray(parsed.posts) ? (parsed.posts as BlogPost[]) : []
  } catch {
    return []
  }
}

/**
 * Read for the public GET.
 *
 * The live `data/blogs.json` is the source of truth: the deployed copy is a
 * build-time snapshot, so serving that as "the blog" hands readers a list that
 * is missing everything published since the last deploy. When the repository
 * cannot be read (no token locally, GitHub down) the snapshot is still better
 * than nothing, and the caller below decides what may leave the server.
 */
async function readPostsForRead(): Promise<BlogPost[]> {
  try {
    return (await readBlogFile()).posts
  } catch (error) {
    console.warn("Live blog read failed, serving the deployed snapshot:", error)
    return readSnapshotPosts()
  }
}

/**
 * A store over the live file for the write handlers.
 *
 * `read` deliberately has no cache and no snapshot fallback: writing a list the
 * server could not read is the bug that let one request resurrect a deleted post
 * and wipe everything published since the build.
 *
 * A 404 from the contents API is treated as a failure too, not as "the archive is
 * empty". `readBlogFile()` offers a missing file as `{ posts: [], missing: true }`
 * for a genuine first-ever publish, but this route edits an archive that already
 * exists: a 404 here means a bad ref, a token without access, or an outage, and
 * "empty" would replace 73 posts with the one being written. A transient 404 must
 * never be able to do that.
 *
 * `write` pins the sha that `read` returned and refuses to send a commit without
 * one, so a concurrent change fails (409) instead of being silently overwritten —
 * and no future edit can reintroduce an unpinned write by dropping the argument.
 */
function createBlogStore(): PostStore {
  let sha: string | undefined
  return {
    read: async () => {
      const snapshot = await readBlogFile()
      if (snapshot.missing) {
        throw new Error("data/blogs.json was not found in the repository; refusing to write")
      }
      sha = snapshot.sha
      return snapshot.posts
    },
    write: (posts, commitMessage) => {
      if (!sha) {
        return Promise.resolve({
          success: false,
          error: "Refusing to commit the post list without the sha it was read at",
        })
      }
      return commitBlogChanges(JSON.stringify({ posts }, null, 2), commitMessage, sha)
    },
  }
}

/**
 * One place that turns a refused write into a response, so every handler reports
 * a read failure, a missing post, a slug collision and a lost race consistently.
 * Detail goes to the server log; the caller gets a fixed message.
 */
function failureResponse(failure: StoreFailure) {
  console.error("Blog write refused:", failure.code, failure.error)

  switch (failure.code) {
    case "read-failed":
      return NextResponse.json(
        {
          error:
            "Could not read the live post list, so nothing was written. Try again — check the server logs if it keeps failing.",
          code: "read-failed",
        },
        { status: 500 }
      )
    case "exists":
      return NextResponse.json({ error: failure.error, code: "exists" }, { status: 409 })
    case "not-found":
      return NextResponse.json({ error: failure.error }, { status: 404 })
    case "conflict":
      // Someone else committed between our read and our write. Retryable, and
      // explicitly not a data loss: the other commit won.
      return NextResponse.json(
        {
          error:
            "data/blogs.json changed while this change was being saved, so nothing was overwritten. Try again.",
          code: "conflict",
        },
        { status: 409 }
      )
    default:
      return NextResponse.json(
        { error: "Could not commit the change to GitHub. Check server logs.", code: "commit-failed" },
        { status: 500 }
      )
  }
}

/**
 * The public blog index and each post page read this route, unauthenticated.
 *
 * They must not see drafts, and they used to: the handler returned the whole
 * file, `published: false` posts and their bodies included. An admin session
 * (`Bearer` token) still gets the full list, because the admin panel edits
 * drafts — everyone else gets the published archive only. Published bodies are
 * returned as stored: they are the rendered pages, so nothing is disclosed that
 * the site does not already serve at `/blogs/<slug>`.
 */
export async function GET(request: Request) {
  const posts = await readPostsForRead()
  const isAdmin = checkAuth(request)

  // A public read of a page that must never be cached across users: the response
  // differs by Authorization, so say so, and let a shared cache hold only the
  // published projection (the list is larger than the pages that need it, and
  // every anonymous request would otherwise pull the whole file from GitHub).
  const headers = isAdmin
    ? { "Cache-Control": "private, no-store", Vary: "Authorization" }
    : { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", Vary: "Authorization" }

  return NextResponse.json(isAdmin ? posts : publicPosts(posts), { headers })
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const raw = await request.json()
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    const candidate = raw as Record<string, unknown>
    if (typeof candidate.title !== "string" || typeof candidate.content !== "string") {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 })
    }

    const derivedSlug = candidate.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    const slug = normalizeSlug(candidate.slug, derivedSlug)
    if (!slug) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 })
    }

    const newPost = buildNewPost(candidate, slug)
    if (!newPost) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 })
    }

    // This is a *create*: an archived slug is refused rather than replaced, so a
    // "new post" form can never silently overwrite a published post.
    const result = await publishPostToStore(
      createBlogStore(),
      newPost,
      `feat(blog): add post "${newPost.title}"`,
      { refuseExisting: true }
    )
    if (!result.success) return failureResponse(result)

    return NextResponse.json(newPost, { status: 201 })
  } catch (err) {
    console.error("Blog POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const raw = await request.json()
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    const body = raw as Record<string, unknown>

    const slug = normalizeSlug(body.slug, "")
    if (!slug) {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 })
    }

    // Field-by-field against the post as stored now: the caller may not rewrite
    // the slug, the date, or inject arbitrary keys, and the rest of the list is
    // carried over untouched.
    const result = await updatePostInStore(createBlogStore(), slug, body)
    if (!result.success) return failureResponse(result)

    return NextResponse.json(result.post)
  } catch (err) {
    console.error("Blog PUT error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const requested = searchParams.get("slug")
    const slug = requested ? normalizeSlug(requested, "") : null
    if (!slug) {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 })
    }

    const result = await deletePostFromStore(createBlogStore(), slug)
    if (!result.success) return failureResponse(result)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Blog DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
