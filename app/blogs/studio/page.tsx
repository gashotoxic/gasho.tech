'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { renderMarkdown } from '@/lib/studio-api'
import Link from 'next/link'
import { 
  Search, 
  FileText, 
  Copy, 
  Download, 
  RefreshCw, 
  ArrowRight,
  Globe,
  ExternalLink,
  Image as ImageIcon,
  CheckCircle,
  Lock
} from 'lucide-react'

interface GenerateAllResult {
  title: string
  excerpt: string
  topics: string[]
  category: string
  content: string
  imagePrompt: string
  wordCount: number
  searchResults?: Array<{ url: string; title: string; snippet: string }>
}

const categories = ['AI', 'AI Automation', 'Cybersecurity', 'ICT', 'Technology', 'News'] as const

export default function StudioPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [availableModels, setAvailableModels] = useState<Array<{id: string, name: string, provider: string}>>([])
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [result, setResult] = useState<GenerateAllResult | null>(null)
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Admin-only state
  const [selectedModel, setSelectedModel] = useState('glm-4.7-flash')
  const [selectedProvider, setSelectedProvider] = useState('crofai')
  const [imageData, setImageData] = useState('')
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [publishAuthor, setPublishAuthor] = useState('GashoTech Team')
  const [publishPublished, setPublishPublished] = useState(true)
  const [isPublishing, setIsPublishing] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('gashotech_admin_token')
    if (saved) setToken(saved)

    fetch('/api/studio/models')
      .then(r => r.json())
      .then(data => {
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models)
        }
      })
      .catch(() => {})
  }, [])

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token])

  const copyToClipboard = async (field: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      setMessage({ text: 'Failed to copy', type: 'error' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const downloadImage = async () => {
    if (!imageData) return
    const blob = await fetch(`data:image/png;base64,${imageData}`).then(r => r.blob())
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gashotech-blog-${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleGenerate = async () => {
    if (!query.trim()) {
      setMessage({ text: 'Enter a topic to research', type: 'error' })
      return
    }

    setIsLoading(true)
    setMessage(null)
    setResult(null)
    setImageData('')

    try {
      const res = await fetch('/api/studio/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          model: token ? selectedModel : undefined,
          provider: token ? selectedProvider : undefined,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setResult(data)
        setMessage({ text: 'Blog post generated!', type: 'success' })
      } else {
        setMessage({ text: data.error || 'Generation failed. Try a different model or topic.', type: 'error' })
      }
    } catch {
      setMessage({ text: 'Generation failed. Check your connection.', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerateImage = async () => {
    if (!result) return
    setIsGeneratingImage(true)
    setMessage(null)

    try {
      const res = await fetch('/api/studio/image', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title: result.title,
          category: result.category,
          style: 'futuristic',
        }),
      })

      const data = await res.json()

      if (res.ok && data.imageData) {
        setImageData(data.imageData)
        setMessage({ text: 'Image generated!', type: 'success' })
      } else {
        setMessage({ text: data.error || 'Image generation failed. Copy the prompt and use it on create.gashotech.com', type: 'error' })
      }
    } catch {
      setMessage({ text: 'Image generation failed', type: 'error' })
    } finally {
      setIsGeneratingImage(false)
    }
  }

  const handlePublish = async () => {
    if (!result) return
    if (!token) {
      setMessage({ text: 'Please log in at /blogs/admin to publish', type: 'error' })
      return
    }

    setIsPublishing(true)
    setMessage(null)

    try {
      const slug = result.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const imagePath = imageData
        ? `/images/blog/${slug}.webp`
        : '/images/AI.webp'

      // If we have image data, commit it first
      if (imageData) {
        await fetch('/api/studio/publish', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            title: result.title,
            excerpt: result.excerpt,
            content: result.content,
            category: result.category,
            author: publishAuthor,
            imageData,
            imagePath,
            published: publishPublished,
          }),
        }).then(r => r.json())
      }

      // Commit blog post
      const res = await fetch('/api/blogs', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          slug,
          title: result.title,
          excerpt: result.excerpt,
          content: result.content,
          category: result.category,
          author: publishAuthor,
          image: imagePath,
          date: new Date().toISOString().split('T')[0],
          published: publishPublished,
        }),
      })

      const data = await res.json()
      if (res.ok || res.status === 201) {
        setMessage({ text: 'Published successfully!', type: 'success' })
        setTimeout(() => router.push(`/blogs/${slug}`), 2000)
      } else {
        setMessage({ text: data.error || 'Publish failed. Try copying the content instead.', type: 'error' })
      }
    } catch {
      setMessage({ text: 'Publish failed. You can still copy the content below.', type: 'error' })
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className="pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Blog Content Studio</h1>
            <p className="text-foreground/70 dark:text-[#cccccd] text-sm">
              AI-powered blog content generation — research, write, and get your image prompt in one click
            </p>
          </div>
          <div className="flex gap-3">
            {token ? (
              <Link
                href="/blogs/admin"
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg hover:bg-accent transition-all text-sm"
              >
                <Lock className="w-4 h-4" />
                Admin Dashboard
              </Link>
            ) : (
              <Link
                href="/blogs/admin"
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg hover:bg-accent transition-all text-sm"
              >
                <Lock className="w-4 h-4" />
                Admin Login
              </Link>
            )}
            <a
              href="https://create.gashotech.com"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg hover:bg-accent transition-all text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              create.gashotech.com
            </a>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg text-sm border ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Input Section */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-[#1abc9c]" />
            What do you want to write about?
          </h2>

          {token && availableModels.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Model</label>
              <select
                value={selectedModel}
                onChange={(e) => {
                  const model = availableModels.find(m => m.id === e.target.value)
                  setSelectedModel(e.target.value)
                  if (model) setSelectedProvider(model.provider)
                }}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
              >
                {availableModels.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., AI trends in Africa 2026, How to secure your small business, The future of automation in Kenya..."
              rows={1}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors resize-none"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
            />
            <button
              onClick={handleGenerate}
              disabled={isLoading || !query.trim()}
              className="px-8 py-3 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2 whitespace-nowrap"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Press Enter to generate, Shift+Enter for new line</p>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Title & Excerpt */}
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Title</label>
                  <h2 className="text-2xl font-bold mt-1">{result.title}</h2>
                </div>
                <button
                  onClick={() => copyToClipboard('title', result.title)}
                  className="ml-4 px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all text-sm flex items-center gap-1 shrink-0"
                  title="Copy title"
                >
                  {copiedField === 'title' ? (
                    <><CheckCircle className="w-3 h-3 text-green-400" /> Copied!</>
                  ) : (
                    <><Copy className="w-3 h-3" /> Copy</>
                  )}
                </button>
              </div>

              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Excerpt</label>
                  <p className="text-muted-foreground mt-1">{result.excerpt}</p>
                </div>
                <button
                  onClick={() => copyToClipboard('excerpt', result.excerpt)}
                  className="ml-4 px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all text-sm flex items-center gap-1 shrink-0"
                  title="Copy excerpt"
                >
                  {copiedField === 'excerpt' ? (
                    <><CheckCircle className="w-3 h-3 text-green-400" /> Copied!</>
                  ) : (
                    <><Copy className="w-3 h-3" /> Copy</>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <span className="text-xs px-2.5 py-1 bg-[#1abc9c]/10 text-[#1abc9c] rounded-full border border-[#1abc9c]/30">
                  {result.category}
                </span>
                <span className="text-xs px-2.5 py-1 bg-blue-500/10 text-blue-400 rounded-full">
                  {result.wordCount} words
                </span>
                {result.topics.map((topic, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 bg-accent rounded-full">
                    {topic}
                  </span>
                ))}
              </div>
            </div>

            {/* Blog Content */}
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Blog Content</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
                    className="text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all"
                  >
                    {showMarkdownPreview ? 'Rendered View' : 'Markdown View'}
                  </button>
                  <button
                    onClick={() => copyToClipboard('content', result.content)}
                    className="text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all flex items-center gap-1"
                  >
                    {copiedField === 'content' ? (
                      <><CheckCircle className="w-3 h-3 text-green-400" /> Copied!</>
                    ) : (
                      <><Copy className="w-3 h-3" /> Copy Content</>
                    )}
                  </button>
                </div>
              </div>

              {showMarkdownPreview ? (
                <pre className="bg-border rounded-lg p-4 font-mono text-sm overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {result.content}
                </pre>
              ) : (
                <div
                  className="prose dark:prose-invert max-w-none bg-border rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(result.content)
                  }}
                />
              )}
            </div>

            {/* Image Prompt */}
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold">Image Prompt</h3>
                  <p className="text-xs text-muted-foreground">Use this prompt on create.gashotech.com or any AI image generator</p>
                </div>
                <button
                  onClick={() => copyToClipboard('imagePrompt', result.imagePrompt)}
                  className="px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all text-sm flex items-center gap-1 shrink-0"
                >
                  {copiedField === 'imagePrompt' ? (
                    <><CheckCircle className="w-3 h-3 text-green-400" /> Copied!</>
                  ) : (
                    <><Copy className="w-3 h-3" /> Copy Prompt</>
                  )}
                </button>
              </div>
              <div className="bg-accent rounded-lg p-3">
                <p className="text-sm font-mono text-foreground break-words">{result.imagePrompt}</p>
              </div>
            </div>

            {/* Admin: Image Generation + Publish */}
            {token && (
              <div className="space-y-6">
                {/* Generate Image */}
                <div className="bg-card border border-border rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-[#1abc9c]" />
                    Generate Blog Image
                  </h3>
                  <button
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage}
                    className="px-6 py-2.5 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isGeneratingImage ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</>
                    ) : (
                      <><ImageIcon className="w-4 h-4" /> Generate Image</>
                    )}
                  </button>

                  {imageData && (
                    <div className="mt-4">
                      <div className="relative">
                        <img
                          src={`data:image/png;base64,${imageData}`}
                          alt="Generated blog image"
                          className="w-full rounded-lg border border-border max-h-96 object-contain"
                        />
                        <div className="absolute top-2 right-2 flex gap-2">
                          <button
                            onClick={handleGenerateImage}
                            className="px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg text-sm flex items-center gap-1 transition-all"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Regenerate
                          </button>
                          <button
                            onClick={downloadImage}
                            className="px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg text-sm flex items-center gap-1 transition-all"
                          >
                            <Download className="w-3 h-3" />
                            Download
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {!imageData && (
                    <div className="mt-4 p-4 bg-accent rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        Use the image prompt above on <a href="https://create.gashotech.com" target="_blank" rel="noopener" className="text-[#1abc9c] hover:underline">create.gashotech.com</a> to generate your blog header image.
                      </p>
                    </div>
                  )}
                </div>

                {/* Publish */}
                <div className="bg-card border border-border rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-[#1abc9c]" />
                    Publish
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Author</label>
                      <input
                        type="text"
                        value={publishAuthor}
                        onChange={(e) => setPublishAuthor(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="published"
                        checked={publishPublished}
                        onChange={(e) => setPublishPublished(e.target.checked)}
                        className="rounded border-border"
                      />
                      <label htmlFor="published" className="text-sm">Published (visible on blog)</label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <button
                        onClick={handlePublish}
                        disabled={isPublishing}
                        className="py-3 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isPublishing ? (
                          <><RefreshCw className="w-4 h-4 animate-spin" /> Publishing...</>
                        ) : (
                          <><CheckCircle className="w-4 h-4" /> Publish to Blog</>
                        )}
                      </button>
                      <Link
                        href={`/blogs`}
                        className="py-3 border border-border rounded-lg font-semibold hover:bg-accent transition-all text-center flex items-center justify-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Blog
                      </Link>
                    </div>

                    <div className="border-t border-border pt-4 mt-4">
                      <p className="text-sm text-muted-foreground mb-2">Or copy individual pieces:</p>
                      <div className="flex flex-wrap gap-2">
                        {(copiedField === 'title') ? (
                          <span className="text-xs px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg border border-green-500/30 inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Title Copied!</span>
                        ) : (
                          <button onClick={() => copyToClipboard('title', result.title)} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all">Copy Title</button>
                        )}
                        {(copiedField === 'excerpt') ? (
                          <span className="text-xs px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg border border-green-500/30 inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Excerpt Copied!</span>
                        ) : (
                          <button onClick={() => copyToClipboard('excerpt', result.excerpt)} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all">Copy Excerpt</button>
                        )}
                        {(copiedField === 'content') ? (
                          <span className="text-xs px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg border border-green-500/30 inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Content Copied!</span>
                        ) : (
                          <button onClick={() => copyToClipboard('content', result.content)} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all">Copy Content</button>
                        )}
                        {(copiedField === 'imagePrompt') ? (
                          <span className="text-xs px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg border border-green-500/30 inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Prompt Copied!</span>
                        ) : (
                          <button onClick={() => copyToClipboard('imagePrompt', result.imagePrompt)} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all">Copy Image Prompt</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Public: CTA to create.gashotech.com */}
            {!token && (
              <div className="bg-gradient-to-r from-[#1abc9c]/5 to-blue-500/5 border border-[#1abc9c]/20 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#1abc9c]/10 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-6 h-6 text-[#1abc9c]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">Want to generate images too?</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Head over to <strong>create.gashotech.com</strong> and paste the image prompt above into the Media tab.
                      You can generate blog header images, animations, social media graphics, and more using AI.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href="https://create.gashotech.com"
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#1abc9c] text-white rounded-lg text-sm font-semibold hover:bg-[#16a085] transition-all"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Go to create.gashotech.com
                      </a>
                      <Link
                        href="/blogs/admin"
                        className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent transition-all"
                      >
                        <Lock className="w-4 h-4" />
                        Sign in for publishing
                      </Link>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground space-y-1">
                      <p>💡 <strong>Pro tip:</strong> Generate multiple image variations by tweaking the prompt on create.gashotech.com's Media tab. You can also create animations, product mockups, and social media visuals.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Search Results Reference */}
            {result.searchResults && result.searchResults.length > 0 && (
              <details className="bg-card border border-border rounded-xl p-4">
                <summary className="text-sm font-medium cursor-pointer hover:text-[#1abc9c] transition-colors">
                  Web search results used ({result.searchResults.length})
                </summary>
                <div className="mt-3 space-y-2">
                  {result.searchResults.map((r, i) => (
                    <div key={i} className="text-sm">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#1abc9c] hover:underline">
                        {r.title}
                      </a>
                      <p className="text-muted-foreground text-xs mt-0.5">{r.snippet}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Empty State */}
        {!result && !isLoading && (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">Enter a topic above to get started</h3>
            <p className="text-sm text-muted-foreground/60 mt-1">
              The AI will research, write, and prepare everything you need
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <RefreshCw className="w-10 h-10 text-[#1abc9c] mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-medium">Generating your blog post...</h3>
            <p className="text-sm text-muted-foreground mt-1">Researching, writing, and preparing everything</p>
          </div>
        )}
      </div>
    </div>
  )
}
