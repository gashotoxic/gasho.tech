import { promises as fs } from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { commitBlogChanges } from "@/lib/github"

const DATA_FILE = path.join(process.cwd(), "data", "blogs.json")
const CACHE_FILE = "/tmp/blogs.json"

interface BlogPost {
  slug: string
  title: string
  excerpt: string
  content: string
  author: string
  category: string
  date: string
  image: string
  published: boolean
}

function checkAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false
  return verifyToken(authHeader.slice(7))
}

/** Slugs feed routing, so normalise and bound them instead of trusting the body. */
function normalizeSlug(input: unknown, fallback: string): string | null {
  const raw = typeof input === "string" && input.trim() ? input : fallback
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  if (!slug || slug.length > 120) return null
  return slug
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback
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
    const post: BlogPost = await request.json()
    if (!post || typeof post !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    if (!post.title || !post.content) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 })
    }

    const posts = await readPosts()
    const derivedSlug = post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    const slug = normalizeSlug(post.slug, derivedSlug)
    if (!slug) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 })
    }

    if (posts.find((p) => p.slug === slug)) {
      return NextResponse.json({ error: "A post with this slug already exists" }, { status: 409 })
    }

    const newPost: BlogPost = {
      slug,
      title: post.title,
      excerpt: post.excerpt || post.title,
      content: post.content,
      author: post.author || "GashoTech Team",
      category: post.category || "Technology",
      date: new Date().toISOString().split("T")[0],
      image: post.image || "/images/AI.webp",
      published: post.published ?? true,
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
    const updated: BlogPost = await request.json()
    if (!updated || typeof updated !== "object" || !updated.slug) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const posts = await readPosts()
    const slug = normalizeSlug(updated.slug, "")
    const index = slug ? posts.findIndex((p) => p.slug === slug) : -1

    if (index === -1) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    // Field-by-field: the caller may not rewrite the slug, the date, or inject
    // arbitrary keys into the stored post.
    const existing = posts[index]
    posts[index] = {
      slug: existing.slug,
      title: asString(updated.title, existing.title),
      excerpt: asString(updated.excerpt, existing.excerpt),
      content: asString(updated.content, existing.content),
      author: asString(updated.author, existing.author),
      category: asString(updated.category, existing.category),
      date: existing.date,
      image: asString(updated.image, existing.image),
      published:
        typeof updated.published === "boolean" ? updated.published : existing.published,
    }
    const jsonContent = JSON.stringify({ posts }, null, 2)

    await cachePosts(posts)

    const result = await commitBlogChanges(jsonContent, `feat(blog): update post "${updated.title}"`)
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
