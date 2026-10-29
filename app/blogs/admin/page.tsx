"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Plus, Edit3, Trash2, ExternalLink, LogOut, Lock, RefreshCw } from "lucide-react"
import type { BlogPost } from "@/lib/blogs"
import {
  clearAdminToken,
  readAdminToken,
  refreshAdminSession,
  storeAdminToken,
} from "@/lib/admin-client"

/**
 * The admin panel loads the post list from `GET /api/blogs`, never from
 * `data/blogs.json`.
 *
 * Importing the data module into this client component (as it used to) shipped
 * the whole archive — every body, drafts included — in a public JavaScript
 * chunk of `/blogs/admin`, so "the admin panel" was readable by anyone. The
 * endpoint is the only correct source: it returns published posts to anyone
 * and the full list (drafts included) to a `Bearer` session, and it is the live
 * archive rather than a build-time snapshot, so the list is fresh after a save.
 */

interface BlogForm {
  title: string
  excerpt: string
  content: string
  category: string
  author: string
  image: string
}

const emptyForm: BlogForm = {
  title: "",
  excerpt: "",
  content: "",
  category: "AI",
  author: "GashoTech Team",
  image: "/images/gashotech_logo_correct.webp",
}

export default function BlogAdminPage() {
  const [token, setToken] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [loggingIn, setLoggingIn] = useState(false)
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [postsStatus, setPostsStatus] = useState<"loading" | "ready" | "error">("loading")
  const [showForm, setShowForm] = useState(false)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [form, setForm] = useState<BlogForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ text: "", type: "success" as "success" | "error" })

  /**
   * Load the post list for this session, drafts included.
   *
   * `GET /api/blogs` answers 200 with the *public* (published-only) projection
   * for a missing or expired token, so it can never be the "your session is
   * gone" signal — a stale session would silently render the public list inside
   * the admin panel and an admin would think their drafts had been deleted.
   * `refreshAdminSession()` is the honest check: it returns null only on a
   * genuine 401, and keeps the token on a 429/5xx where the session may still
   * be perfectly valid.
   */
  const loadPosts = useCallback(async (sessionToken: string) => {
    setPostsStatus("loading")

    const live = await refreshAdminSession()
    if (!live) {
      setToken(null)
      setPosts([])
      setPostsStatus("ready")
      setLoginError("Your session expired. Sign in again.")
      return
    }
    if (live !== sessionToken) setToken(live)

    try {
      const res = await fetch("/api/blogs", {
        headers: { Authorization: `Bearer ${live}` },
        cache: "no-store",
      })

      // Kept as a safety net: today the endpoint degrades to the public
      // projection instead, but a 401 must never render as a working session.
      if (res.status === 401) {
        clearAdminToken()
        setToken(null)
        setPosts([])
        setPostsStatus("ready")
        setLoginError("Your session expired. Sign in again.")
        return
      }
      if (!res.ok) throw new Error(`GET /api/blogs returned ${res.status}`)

      const data = await res.json()
      setPosts(Array.isArray(data) ? (data as BlogPost[]) : [])
      setPostsStatus("ready")
    } catch (error) {
      console.error("Could not load the post list:", error)
      setPostsStatus("error")
    }
  }, [])

  // Restore a saved session on mount. loadPosts refreshes it as part of the
  // session check, so there is no second refresh here to race with it.
  useEffect(() => {
    const saved = readAdminToken()
    if (!saved) return

    // Restoring a persisted session is an external-system sync; this rule does
    // not model localStorage reads, so the setter here is intentional.
    /* eslint-disable react-hooks/set-state-in-effect */
    setToken(saved)
    /* eslint-enable react-hooks/set-state-in-effect */
    void loadPosts(saved)
  }, [loadPosts])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoggingIn(true)
    setLoginError("")

    try {
      const res = await fetch("/api/blogs/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })

      if (!res.ok) {
        const wait = res.headers.get("Retry-After")
        setLoginError(
          res.status === 429
            ? `Too many failed attempts. Try again in ${wait ? `${wait} seconds` : "a few minutes"}.`
            : res.status === 503
              ? "Admin login is not configured on the server."
              : "Invalid password"
        )
        setLoggingIn(false)
        return
      }

      const data = await res.json()
      storeAdminToken(data.token)
      setToken(data.token)
      setLoginError("")
      void loadPosts(data.token)
    } catch {
      setLoginError("Failed to connect. Check your internet.")
    }

    setLoggingIn(false)
  }

  const handleLogout = () => {
    clearAdminToken()
    setToken(null)
    setPassword("")
  }

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage({ text: "", type: "success" })

    const slug = editingSlug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

    // The form has no draft toggle, and an edit must not publish a draft by
    // accident: keep whatever visibility the stored post already has. (Drafts
    // are not confidential here — `published: false` only hides a post from the
    // site, not from the internet — but "edit a draft" must not mean "publish".)
    const archived = editingSlug ? posts.find((p) => p.slug === editingSlug) : undefined

    const newPost = {
      slug,
      ...form,
      published: archived ? archived.published : true,
      date: new Date().toISOString().split("T")[0],
    }

    try {
      const res = await fetch("/api/blogs", {
        method: editingSlug ? "PUT" : "POST",
        headers: authHeaders(),
        body: JSON.stringify(newPost),
      })
      const data = await res.json()
      if (res.status === 401) {
        clearAdminToken()
        setToken(null)
        setLoginError("Your session expired. Sign in again.")
        setSaving(false)
        return
      }
      if (res.ok) {
        setMessage({ text: editingSlug ? "Blog post updated! Changes pushed to GitHub." : "Blog post created! Changes pushed to GitHub.", type: "success" })
        setShowForm(false)
        setEditingSlug(null)
        setForm(emptyForm)
        // Reload the list with the session token so drafts stay visible and the
        // list reflects what the server actually committed.
        if (token) await loadPosts(token)
        setTimeout(() => setMessage({ text: "", type: "success" }), 4000)
      } else {
        setMessage({ text: data.error || "Something went wrong", type: "error" })
      }
    } catch {
      setMessage({ text: "Failed to save. Check console for details.", type: "error" })
    }
    setSaving(false)
  }

  const handleDelete = async (slug: string) => {
    if (!confirm("Delete this blog post? Changes will be committed to GitHub.")) return
    try {
      const res = await fetch(`/api/blogs?slug=${slug}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      if (res.ok) {
        setPosts((p) => p.filter((b) => b.slug !== slug))
        setMessage({ text: "Post deleted and committed to GitHub.", type: "success" })
        setTimeout(() => setMessage({ text: "", type: "success" }), 3000)
      } else if (res.status === 401) {
        clearAdminToken()
        setToken(null)
        setLoginError("Your session expired. Sign in again.")
      } else {
        const data = await res.json()
        setMessage({ text: data.error || "Delete failed", type: "error" })
      }
    } catch {
      setMessage({ text: "Failed to delete", type: "error" })
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
    })
    setEditingSlug(slug)
    setShowForm(true)
  }

  // If not logged in, show login screen
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-grey pt-16">
        <div className="bg-card rounded-2xl shadow-xl p-8 w-full max-w-md mx-4 border border-border">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-[#1abc9c] mx-auto mb-4 flex items-center justify-center">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Blog Admin</h1>
            <p className="text-muted-foreground text-sm mt-1">Enter admin password to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin password"
                required
                autoFocus
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors text-center text-lg"
              />
            </div>
            {loginError && (
              <p className="text-red-500 text-sm text-center">{loginError}</p>
            )}
            <button
              type="submit"
              disabled={loggingIn || !password}
              className="w-full py-3 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 hover:shadow-lg disabled:opacity-50"
            >
              {loggingIn ? "Checking..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Set BLOG_ADMIN_PASSWORD env var to configure
          </p>
        </div>
      </div>
    )
  }

  // Logged in — show admin panel
  return (
    <div className="pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Blog Admin</h1>
            <p className="text-foreground/70 dark:text-[#cccccd] text-sm">
              {posts.length} post(s) &middot; Changes auto-commit to GitHub
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/blogs"
              className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-[#1abc9c] text-[#1abc9c] rounded-lg hover:bg-[#1abc9c] hover:text-white transition-all duration-300 hover:shadow-lg text-sm font-semibold"
            >
              <ExternalLink className="h-4 w-4" />
              View Blog
            </Link>
            <Link
              href="/blogs/studio"
              className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-purple-500 text-purple-500 rounded-lg hover:bg-purple-500 hover:text-white transition-all duration-300 hover:shadow-lg text-sm font-semibold"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Blog Content Studio
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
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg hover:bg-accent transition-all text-sm"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg text-sm border ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
          }`}>
            {message.text}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="mb-8 bg-card border border-border rounded-xl p-6 shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingSlug ? "Edit Post" : "New Post"}
              {editingSlug && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (slug: {editingSlug})
                </span>
              )}
            </h2>
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
                <p className="text-xs text-muted-foreground mb-1">
                  Use ## for H2, ### for H3, #### for H4, - for bullet lists, 1. for numbered lists
                </p>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  required
                  rows={12}
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
                  <p className="text-xs text-muted-foreground mt-1">
                    Place images in /public/images/ and use /images/name.webp
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Saved posts are public: this site is built from a public Git repository, so
                an unpublished flag hides a post from the site, not from the internet. Keep
                confidential or unfinished writing outside this repository.
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
                >
                  {saving ? "Saving & Pushing to GitHub..." : editingSlug ? "Update Post" : "Create Post"}
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
          <div className="p-4 border-b border-border bg-muted/50 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {postsStatus === "loading" ? "Loading…" : `${posts.length} post(s)`}
            </p>
            <span className="text-xs text-muted-foreground">
              Changes auto-commit to <strong>main</strong>
            </span>
          </div>
          {postsStatus === "loading" && posts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground" role="status">
              Loading posts…
            </div>
          ) : postsStatus === "error" ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">Could not load the post list.</p>
              <button
                onClick={() => token && loadPosts(token)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-accent transition-all text-sm"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
            </div>
          ) : posts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No blog posts yet. Click &ldquo;New Post&rdquo; to create one.
            </div>
          ) : (
            posts.map((post) => (
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
            ))
          )}
        </div>
      </div>
    </div>
  )
}
