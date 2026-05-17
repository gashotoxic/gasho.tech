"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { blogPosts } from "@/lib/blogs"
import { Plus, Edit3, Trash2, ExternalLink } from "lucide-react"

interface BlogForm {
  title: string
  excerpt: string
  content: string
  category: string
  author: string
  image: string
  published: boolean
}

const emptyForm: BlogForm = {
  title: "",
  excerpt: "",
  content: "",
  category: "AI",
  author: "GashoTech Team",
  image: "/images/AI.webp",
  published: true,
}

export default function BlogAdminPage() {
  const router = useRouter()
  const [posts, setPosts] = useState(blogPosts)
  const [showForm, setShowForm] = useState(false)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [form, setForm] = useState<BlogForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    setPosts(blogPosts)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage("")

    const slug = editingSlug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

    const newPost = {
      slug,
      ...form,
      date: new Date().toISOString().split("T")[0],
    }

    try {
      const res = await fetch("/api/blogs", {
        method: editingSlug ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPost),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(editingSlug ? "Blog post updated!" : "Blog post created!")
        setShowForm(false)
        setEditingSlug(null)
        setForm(emptyForm)
        router.refresh()
        setTimeout(() => setMessage(""), 3000)
      } else {
        setMessage(data.error || "Something went wrong")
      }
    } catch {
      setMessage("Failed to save. Check console for details.")
    }
    setSaving(false)
  }

  const handleDelete = async (slug: string) => {
    if (!confirm("Delete this blog post?")) return
    try {
      const res = await fetch(`/api/blogs?slug=${slug}`, { method: "DELETE" })
      if (res.ok) {
        setPosts((p) => p.filter((b) => b.slug !== slug))
        router.refresh()
      }
    } catch {
      // silent
    }
  }

  const startEdit = (slug: string) => {
    const post = posts.find((p) => p.slug === slug)
    if (!post) return
    setForm({
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      category: post.category,
      author: post.author,
      image: post.image,
      published: post.published,
    })
    setEditingSlug(slug)
    setShowForm(true)
  }

  return (
    <div className="pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Blog Admin</h1>
            <p className="text-foreground/70 dark:text-[#cccccc]">Manage your blog posts</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/blogs"
              className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-[#1abc9c] text-[#1abc9c] rounded-lg hover:bg-[#1abc9c] hover:text-white transition-all duration-300 hover:shadow-lg text-sm font-semibold"
            >
              <ExternalLink className="h-4 w-4" />
              View Blog
            </Link>
            <button
              onClick={() => {
                setForm(emptyForm)
                setEditingSlug(null)
                setShowForm(true)
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1abc9c] text-white rounded-lg hover:bg-[#16a085] transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              New Post
            </button>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className="mb-6 p-4 bg-[#1abc9c]/10 border border-[#1abc9c]/30 rounded-lg text-[#1abc9c] text-sm">
            {message}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="mb-8 bg-card border border-border rounded-xl p-6 shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingSlug ? "Edit Post" : "New Post"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Excerpt *</label>
                <textarea
                  value={form.excerpt}
                  onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                  required
                  rows={2}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Content (Markdown-style) *</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  required
                  rows={10}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                  >
                    <option>AI</option>
                    <option>AI Automation</option>
                    <option>Cybersecurity</option>
                    <option>ICT</option>
                    <option>Technology</option>
                    <option>News</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Author</label>
                  <input
                    type="text"
                    value={form.author}
                    onChange={(e) => setForm({ ...form, author: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Image Path</label>
                  <input
                    type="text"
                    value={form.image}
                    onChange={(e) => setForm({ ...form, image: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="published"
                  checked={form.published}
                  onChange={(e) => setForm({ ...form, published: e.target.checked })}
                  className="rounded border-border"
                />
                <label htmlFor="published" className="text-sm">
                  Published
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
                >
                  {saving ? "Saving..." : editingSlug ? "Update Post" : "Create Post"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setEditingSlug(null)
                    setForm(emptyForm)
                  }}
                  className="px-6 py-2.5 border border-border rounded-lg hover:bg-accent transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Posts List */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow">
          <div className="p-4 border-b border-border bg-muted/50">
            <p className="text-sm text-muted-foreground">{posts.length} post(s)</p>
          </div>
          {posts.map((post) => (
            <div
              key={post.slug}
              className="flex items-center justify-between p-4 border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{post.title}</h3>
                  {!post.published && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-full">
                      Draft
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate mt-0.5">
                  {post.category} &middot; {post.date} &middot; {post.author}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Link
                  href={`/blogs/${post.slug}`}
                  className="p-2 hover:text-[#1abc9c] transition-colors"
                  title="View"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
                <button
                  onClick={() => startEdit(post.slug)}
                  className="p-2 hover:text-[#1abc9c] transition-colors"
                  title="Edit"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(post.slug)}
                  className="p-2 hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
