import { promises as fs } from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { applyPostUpdate, buildNewPost, normalizeSlug, type BlogPostShape } from "@/lib/blog-post-update"
import { commitBlogChanges } from "@/lib/github"

const DATA_FILE = path.join(process.cwd(), "data", "blogs.json")
const CACHE_FILE = "/tmp/blogs.json"

type BlogPost = BlogPostShape

function checkAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false
  return verifyToken(authHeader.slice(7))
}


async function readPosts(): Promise<BlogPost[]> {
  try {
    // Try cache first (written by this API on previous calls)
    const raw = await fs.readFile(CACHE_FILE, "utf-8")
    return JSON.parse(raw).posts || []
  } catch {
    // Fall back to deployment file (read-only on Vercel)
    try {
      const raw = await fs.readFile(DATA_FILE, "utf-8")
      return JSON.parse(raw).posts || []
    } catch {
      return []
    }
  }
}

async function cachePosts(posts: BlogPost[]) {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify({ posts }, null, 2), "utf-8")
  } catch {
    // Cache write is best-effort
  }
}

export async function GET(request: Request) {
  const posts = await readPosts()
  return NextResponse.json(posts)
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

    const posts = await readPosts()
    const derivedSlug = candidate.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    const slug = normalizeSlug(candidate.slug, derivedSlug)
    if (!slug) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 })
    }

    if (posts.find((p) => p.slug === slug)) {
      return NextResponse.json({ error: "A post with this slug already exists" }, { status: 409 })
    }

    const newPost = buildNewPost(candidate, slug)
    if (!newPost) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 })
    }

    posts.push(newPost)
    const jsonContent = JSON.stringify({ posts }, null, 2)

    // Cache locally (best-effort, may fail on read-only FS)
    await cachePosts(posts)

    // Persist to GitHub — this is the real source of truth
    const result = await commitBlogChanges(jsonContent, `feat(blog): add post "${newPost.title}"`)
    if (!result.success) {
      console.error("GitHub commit failed:", result.error)
      return NextResponse.json({ error: "Could not commit the change to GitHub. Check server logs." }, { status: 500 })
    }

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

    const posts = await readPosts()
    const slug = normalizeSlug(body.slug, "")
    const index = slug ? posts.findIndex((p) => p.slug === slug) : -1

    if (index === -1) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    // Field-by-field: the caller may not rewrite the slug, the date, or inject
    // arbitrary keys into the stored post.
    posts[index] = applyPostUpdate(posts[index], body)
    const saved = posts[index]
    const jsonContent = JSON.stringify({ posts }, null, 2)

    await cachePosts(posts)

    const result = await commitBlogChanges(jsonContent, `feat(blog): update post "${saved.title}"`)
    if (!result.success) {
      console.error("GitHub commit failed:", result.error)
      return NextResponse.json({ error: "Could not commit the change to GitHub. Check server logs." }, { status: 500 })
    }

    return NextResponse.json(posts[index])
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

    const posts = await readPosts()
    const deletedPost = posts.find((p) => p.slug === slug)
    const index = posts.findIndex((p) => p.slug === slug)
    if (index === -1) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    posts.splice(index, 1)
    const jsonContent = JSON.stringify({ posts }, null, 2)

    await cachePosts(posts)

    const result = await commitBlogChanges(jsonContent, `feat(blog): delete post "${deletedPost?.title || slug}"`)
    if (!result.success) {
      console.error("GitHub commit failed:", result.error)
      return NextResponse.json({ error: "Could not commit the change to GitHub. Check server logs." }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Blog DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
