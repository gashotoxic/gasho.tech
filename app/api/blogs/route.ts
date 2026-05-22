import { promises as fs } from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { commitBlogChanges } from "@/lib/github"

const DATA_FILE = path.join(process.cwd(), "data", "blogs.json")

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

async function readPosts(): Promise<BlogPost[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8")
    return JSON.parse(raw).posts || []
  } catch {
    return []
  }
}

async function writePosts(posts: BlogPost[]) {
  await fs.writeFile(DATA_FILE, JSON.stringify({ posts }, null, 2), "utf-8")
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
    if (!post.title || !post.content) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 })
    }

    const posts = await readPosts()
    const slug = post.slug || post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

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
    await writePosts(posts)

    // Persist to GitHub (non-blocking — don't fail the request if it errors)
    commitBlogChanges(jsonContent, `feat(blog): add post "${newPost.title}"`).then((result) => {
      if (!result.success) {
        console.error("GitHub commit failed:", result.error)
      }
    })

    return NextResponse.json(newPost, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const updated: BlogPost = await request.json()
    const posts = await readPosts()
    const index = posts.findIndex((p) => p.slug === updated.slug)

    if (index === -1) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    posts[index] = { ...posts[index], ...updated }
    const jsonContent = JSON.stringify({ posts }, null, 2)
    await writePosts(posts)

    // Persist to GitHub (non-blocking)
    commitBlogChanges(jsonContent, `feat(blog): update post "${updated.title}"`).then((result) => {
      if (!result.success) {
        console.error("GitHub commit failed:", result.error)
      }
    })

    return NextResponse.json(posts[index])
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get("slug")
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
    await writePosts(posts)

    // Persist to GitHub (non-blocking)
    commitBlogChanges(jsonContent, `feat(blog): delete post "${deletedPost?.title || slug}"`).then((result) => {
      if (!result.success) {
        console.error("GitHub commit failed:", result.error)
      }
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
