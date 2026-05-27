'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  Search, 
  FileText, 
  Image as ImageIcon, 
  CheckCircle, 
  Copy, 
  Download, 
  RefreshCw, 
  ArrowRight,
  AlertCircle,
  Check,
  Globe,
  Lock
} from 'lucide-react'

interface ResearchResult {
  title: string
  excerpt: string
  topics: string[]
  category: string
  searchResults?: Array<{ url: string; title: string; snippet: string }>
  warning?: string
}

interface WriteResult {
  content: string
  wordCount: number
}

interface ImageResult {
  imageData: string
  prompt?: string
  fallbackPrompt?: string
  success: boolean
  error?: string
}

type Step = 'research' | 'write' | 'image' | 'publish'

const categories = ['AI', 'AI Automation', 'Cybersecurity', 'ICT', 'Technology', 'News'] as const

const toneOptions = ['Professional but accessible', 'Technical deep-dive', 'Casual and engaging'] as const

export default function StudioPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [availableModels, setAvailableModels] = useState<Array<{id: string, name: string, provider: string}>>([])
  const [currentStep, setCurrentStep] = useState<Step>('research')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Research state
  const [query, setQuery] = useState('')
  const [selectedModel, setSelectedModel] = useState('glm-4.7-flash')
  const [selectedProvider, setSelectedProvider] = useState('crofai')
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null)
  const [showSearchResults, setShowSearchResults] = useState(false)

  // Write state
  const [writeTone, setWriteTone] = useState('Professional but accessible')
  const [writeContent, setWriteContent] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false)

  // Image state
  const [selectedStyle, setSelectedStyle] = useState('futuristic')
  const [imageResult, setImageResult] = useState<ImageResult | null>(null)
  const [imagePrompt, setImagePrompt] = useState('')

  // Publish state
  const [publishData, setPublishData] = useState({
    author: 'GashoTech Team',
    published: true,
  })

  // Check for existing token on mount + load models
  useEffect(() => {
    const saved = localStorage.getItem('gashotech_admin_token')
    if (saved) {
      setToken(saved)
    }
    fetchModels()
  }, [])

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/studio/models')
      const data = await res.json()
      if (data.models && data.models.length > 0) {
        setAvailableModels(data.models)
        // If user is logged in, they can pick any model
        // Default is already glm-4.7-flash from crofai
      }
    } catch (e) {
      console.warn('Failed to load models:', e)
    }
  }

  const handleLogin = async (password: string) => {
    const res = await fetch('/api/blogs/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (!res.ok) {
      setMessage({ text: 'Invalid password', type: 'error' })
      return
    }

    const data = await res.json()
    localStorage.setItem('gashotech_admin_token', data.token)
    setToken(data.token)
    setMessage({ text: 'Logged in successfully', type: 'success' })
  }

  const handleLogout = () => {
    localStorage.removeItem('gashotech_admin_token')
    setToken(null)
    setQuery('')
    setResearchResult(null)
    setWriteContent('')
    setImageResult(null)
    setCurrentStep('research')
  }

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage({ text: 'Copied to clipboard!', type: 'success' })
      setTimeout(() => setMessage(null), 3000)
    } catch {
      setMessage({ text: 'Failed to copy', type: 'error' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const downloadImage = async () => {
    if (!imageResult?.imageData) return
    const blob = await fetch(`data:image/png;base64,${imageResult.imageData}`).then(r => r.blob())
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gashotech-blog-${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleResearch = async () => {
    if (!query.trim() || !selectedModel) {
      setMessage({ text: 'Please enter a query and select a model', type: 'error' })
      return
    }

    setIsLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/studio/research', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          query,
          model: selectedModel,
          provider: selectedProvider,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setResearchResult(data)
        setMessage({ text: 'Research complete!', type: 'success' })
      } else {
        setMessage({ text: data.error || 'Research failed', type: 'error' })
      }
    } catch (error) {
      console.error('Research failed:', error)
      setMessage({ text: 'Research failed. Check console.', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleWrite = async () => {
    if (!researchResult || !researchResult.title || !researchResult.topics.length) {
      setMessage({ text: 'Please complete research first', type: 'error' })
      return
    }

    setIsLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/studio/write', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title: researchResult.title,
          excerpt: researchResult.excerpt,
          topics: researchResult.topics,
          category: researchResult.category,
          model: selectedModel,
          provider: selectedProvider,
          tone: writeTone,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setWriteContent(data.content)
        setWordCount(data.wordCount)
        setCurrentStep('image')
        setMessage({ text: 'Blog post generated!', type: 'success' })
      } else {
        setMessage({ text: data.error || 'Write failed', type: 'error' })
      }
    } catch (error) {
      console.error('Write failed:', error)
      setMessage({ text: 'Write failed. Check console.', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerateImage = async () => {
    if (!researchResult || !researchResult.title || !researchResult.category) {
      setMessage({ text: 'Please complete previous steps first', type: 'error' })
      return
    }

    setIsLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/studio/image', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title: researchResult.title,
          category: researchResult.category,
          style: selectedStyle,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setImageResult({
          imageData: data.imageData,
          prompt: data.prompt,
          success: true,
        })
        setImagePrompt(data.prompt || '')
        setCurrentStep('publish')
        setMessage({ text: 'Image generated!', type: 'success' })
      } else {
        setMessage({ text: data.error || 'Image generation failed', type: 'error' })
      }
    } catch (error) {
      console.error('Image generation failed:', error)
      setMessage({ text: 'Image generation failed. Check console.', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handlePublish = async () => {
    if (!researchResult || !writeContent || !imageResult?.imageData) {
      setMessage({ text: 'Please complete all steps before publishing', type: 'error' })
      return
    }

    setIsLoading(true)
    setMessage(null)

    try {
      const slug = researchResult.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      const res = await fetch('/api/studio/publish', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title: researchResult.title,
          excerpt: researchResult.excerpt,
          content: writeContent,
          category: researchResult.category,
          author: publishData.author,
          imageData: imageResult.imageData,
          imagePath: `/images/blog/${slug}.webp`,
          published: publishData.published,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ text: 'Published successfully! Changes committed to GitHub.', type: 'success' })
        setTimeout(() => {
          window.open(data.githubUrl, '_blank')
          router.push(`/blogs/${slug}`)
        }, 1500)
      } else {
        setMessage({ text: data.error || 'Publish failed', type: 'error' })
      }
    } catch (error) {
      console.error('Publish failed:', error)
      setMessage({ text: 'Publish failed. Check console.', type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditResearch = () => {
    setCurrentStep('research')
    setMessage(null)
  }

  const handleEditWrite = () => {
    setCurrentStep('write')
    setMessage(null)
  }

  const handleEditImage = () => {
    setCurrentStep('image')
    setMessage(null)
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-grey pt-16">
        <div className="bg-card rounded-2xl shadow-xl p-8 w-full max-w-md mx-4 border border-border">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-[#1abc9c] mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">Blog Studio Admin</h1>
            <p className="text-muted-foreground text-sm mt-1">Enter admin password to access content studio</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleLogin((e.target as HTMLFormElement).querySelector('input')?.value || '') }} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Admin password"
                required
                autoFocus
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors text-center text-lg"
              />
            </div>
            {message?.type === 'error' && (
              <p className="text-red-500 text-sm text-center">{message.text}</p>
            )}
            <button
              type="submit"
              className="w-full py-3 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300"
            >
              Sign In
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Set BLOG_ADMIN_PASSWORD env var to configure
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Blog Content Studio</h1>
              {token ? (
                <span className="text-xs px-2.5 py-1 bg-[#1abc9c]/10 text-[#1abc9c] rounded-full border border-[#1abc9c]/30 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Admin Mode
                </span>
              ) : (
                <span className="text-xs px-2.5 py-1 bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/30 flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Public Mode
                </span>
              )}
            </div>
            <p className="text-foreground/70 dark:text-[#cccccd] text-sm">
              {token ? 'AI-powered blog content generation with publishing' : 'Generate, copy, and paste — no login required'}
            </p>
          </div>
          <div className="flex gap-3">
            {token ? (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg hover:bg-accent transition-all text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            ) : (
              <Link
                href="/blogs/admin"
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg hover:bg-accent transition-all text-sm"
              >
                <Lock className="w-4 h-4" />
                Admin Login
              </Link>
            )}
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

        {/* Step Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {[
              { id: 'research', label: 'Research & Topic', icon: Search },
              { id: 'write', label: 'Write Content', icon: FileText },
              { id: 'image', label: 'Generate Image', icon: ImageIcon },
              ...(token ? [{ id: 'publish', label: 'Review & Publish', icon: CheckCircle } as const] : []),
            ].map((step) => {
              const stepId = step.id as Step
              const isActive = currentStep === stepId
              const isCompleted = ['research', 'write', 'image', 'publish'].indexOf(currentStep) > 
                                 ['research', 'write', 'image', 'publish'].indexOf(stepId)
              
              const Icon = step.icon
              return (
                <div key={stepId} className="flex-1 text-center">
                  <button
                    onClick={() => {
                      if (isActive) return
                      const currentIndex = ['research', 'write', 'image', 'publish'].indexOf(currentStep)
                      const targetIndex = ['research', 'write', 'image', 'publish'].indexOf(stepId)
                      if (targetIndex >= 0 && targetIndex <= currentIndex) {
                        setCurrentStep(stepId)
                      }
                    }}
                    className={`flex flex-col items-center ${isActive ? 'scale-105' : ''} transition-transform`}
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
                      isCompleted 
                        ? 'bg-green-500 text-white' 
                        : isActive 
                          ? 'bg-[#1abc9c] text-white' 
                          : 'bg-border text-muted-foreground'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {step.label}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
          <div className="h-1 bg-border rounded-full">
            <div 
              className="h-full bg-[#1abc9c] rounded-full transition-all duration-300"
              style={{ width: `${['research', 'write', 'image', 'publish'].filter(s => s === currentStep || ['research', 'write', 'image', 'publish'].indexOf(s) <= ['research', 'write', 'image', 'publish'].indexOf(currentStep)).length * 25}%` }}
            />
          </div>
        </div>

        {/* Step 1: Research */}
        {currentStep === 'research' && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Search className="w-5 h-5 text-[#1abc9c]" />
                Research & Topic Generation
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Research Query</label>
                  <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter a topic idea (e.g., 'AI in healthcare', 'Cybersecurity trends 2026')"
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Select Model
                    {!token && <span className="text-xs text-muted-foreground ml-2">(default: GLM-4.7 Flash)</span>}
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => {
                      const model = availableModels.find(m => m.id === e.target.value)
                      setSelectedModel(e.target.value)
                      if (model) setSelectedProvider(model.provider)
                    }}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                  >
                    {availableModels.length === 0 ? (
                      <option value="glm-4.7-flash">GLM-4.7 Flash (default)</option>
                    ) : (
                      <>
                        {availableModels
                          .filter(m => token ? true : m.id === 'glm-4.7-flash')
                          .map(model => (
                            <option key={model.id} value={model.id}>
                              {model.name} ({model.provider})
                            </option>
                          ))}
                      </>
                    )}
                  </select>
                </div>

                <button
                  onClick={handleResearch}
                  disabled={isLoading || !query.trim() || !selectedModel}
                  className="w-full py-3 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Researching...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Generate Topic
                    </>
                  )}
                </button>
              </div>
            </div>

            {researchResult && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-lg font-bold mb-4">Generated Content</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Title</label>
                    <input
                      type="text"
                      value={researchResult.title}
                      onChange={(e) => setResearchResult({ ...researchResult, title: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                    />
                    <button
                      onClick={() => copyToClipboard(researchResult.title)}
                      className="mt-2 text-sm text-[#1abc9c] hover:underline flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy title
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Excerpt</label>
                    <textarea
                      value={researchResult.excerpt}
                      onChange={(e) => setResearchResult({ ...researchResult, excerpt: e.target.value })}
                      rows={2}
                      className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors font-mono text-sm"
                    />
                    <button
                      onClick={() => copyToClipboard(researchResult.excerpt)}
                      className="mt-2 text-sm text-[#1abc9c] hover:underline flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy excerpt
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Topics</label>
                    <div className="space-y-2">
                      {researchResult.topics.map((topic, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="text-muted-foreground text-sm">{index + 1}.</span>
                          <input
                            type="text"
                            value={topic}
                            onChange={(e) => {
                              const newTopics = [...researchResult.topics]
                              newTopics[index] = e.target.value
                              setResearchResult({ ...researchResult, topics: newTopics })
                            }}
                            className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors font-mono text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Category</label>
                    <select
                      value={researchResult.category}
                      onChange={(e) => setResearchResult({ ...researchResult, category: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {researchResult.searchResults && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Web Search Results</label>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {researchResult.searchResults.map((result, index) => (
                          <div key={index} className="p-3 bg-accent rounded-lg text-sm">
                            <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-[#1abc9c] hover:underline">
                              {result.title}
                            </a>
                            <p className="text-muted-foreground mt-1">{result.snippet}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleWrite}
                    disabled={isLoading || !researchResult.title || researchResult.topics.length === 0}
                    className="flex-1 py-3 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Next: Write Blog Post
                  </button>
                  <button
                    onClick={handleEditResearch}
                    className="px-6 py-3 border border-border rounded-lg hover:bg-accent transition-all text-sm"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Write */}
        {currentStep === 'write' && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#1abc9c]" />
                Write Blog Post
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Tone</label>
                  <select
                    value={writeTone}
                    onChange={(e) => setWriteTone(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                  >
                    {toneOptions.map(tone => (
                      <option key={tone} value={tone}>{tone}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Target Word Count: {wordCount}</label>
                </div>

                <button
                  onClick={handleWrite}
                  disabled={isLoading}
                  className="w-full py-3 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      Generate Blog Post
                    </>
                  )}
                </button>
              </div>
            </div>

            {writeContent && (
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">Generated Content</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
                      className="text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all"
                    >
                      {showMarkdownPreview ? 'Markdown' : 'Preview'}
                    </button>
                    <button
                      onClick={() => copyToClipboard(writeContent)}
                      className="text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </button>
                  </div>
                </div>

                {showMarkdownPreview ? (
                  <div className="bg-border rounded-lg p-4 font-mono text-sm overflow-x-auto max-h-96 overflow-y-auto">
                    <pre>{writeContent}</pre>
                  </div>
                ) : (
                  <div 
                    className="prose dark:prose-invert max-w-none bg-border rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto"
                    dangerouslySetInnerHTML={{ __html: writeContent.replace(/^###/g, '###').replace(/^##/g, '##').replace(/^#/g, '#') }}
                  />
                )}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={handleGenerateImage}
                disabled={isLoading || !writeContent}
                className="flex-1 py-3 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                Next: Generate Image
              </button>
              <button
                onClick={handleEditWrite}
                className="px-6 py-3 border border-border rounded-lg hover:bg-accent transition-all text-sm"
              >
                Back to Edit
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Image */}
        {currentStep === 'image' && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-[#1abc9c]" />
                Generate Blog Image
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Style Preset</label>
                  <select
                    value={selectedStyle}
                    onChange={(e) => setSelectedStyle(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                  >
                    <option value="futuristic">Futuristic</option>
                    <option value="corporate">Corporate/Professional</option>
                    <option value="abstract">Abstract/Creative</option>
                    <option value="network">Network/Infrastructure</option>
                    <option value="machine">AI/Machine Learning</option>
                    <option value="shield">Cybersecurity</option>
                    <option value="server">Data Center</option>
                    <option value="cloud">Cloud Computing</option>
                    <option value="workspace">Modern Workspace</option>
                    <option value="innovation">Innovation Lab</option>
                    <option value="studio">News Studio</option>
                    <option value="editorial">Editorial</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Custom Prompt (optional)</label>
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Enter custom prompt or leave empty to use preset"
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors font-mono text-sm"
                  />
                </div>

                <button
                  onClick={handleGenerateImage}
                  disabled={isLoading}
                  className="w-full py-3 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4" />
                      Generate Image
                    </>
                  )}
                </button>
              </div>
            </div>

            {imageResult?.imageData && (
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">Generated Image</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={downloadImage}
                      className="text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </button>
                    <button
                      onClick={() => copyToClipboard(imageResult.prompt || '')}
                      className="text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-accent transition-all flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      Copy Prompt
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <img
                    src={`data:image/png;base64,${imageResult.imageData}`}
                    alt="Generated blog image"
                    className="w-full rounded-lg border border-border"
                  />
                </div>

                <div className="bg-border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Image Prompt:</p>
                  <p className="text-sm font-mono text-foreground break-words">{imageResult.prompt}</p>
                </div>

                <div className="mt-4 p-3 bg-accent rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">Use this prompt on any AI image generator if needed:</p>
                  <p className="text-xs font-mono text-foreground break-all">{imageResult.fallbackPrompt || imageResult.prompt}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={handlePublish}
                disabled={isLoading || !imageResult?.imageData}
                className="flex-1 py-3 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                Next: Review & Publish
              </button>
              <button
                onClick={handleEditImage}
                className="px-6 py-3 border border-border rounded-lg hover:bg-accent transition-all text-sm"
              >
                Back to Edit
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Publish */}
        {currentStep === 'publish' && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-[#1abc9c]" />
                Review & Publish
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Author</label>
                  <input
                    type="text"
                    value={publishData.author}
                    onChange={(e) => setPublishData({ ...publishData, author: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-[#1abc9c] focus:ring-1 focus:ring-[#1abc9c] outline-none transition-colors"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="published"
                    checked={publishData.published}
                    onChange={(e) => setPublishData({ ...publishData, published: e.target.checked })}
                    className="rounded border-border"
                  />
                  <label htmlFor="published" className="text-sm">
                    Published
                  </label>
                </div>

                <button
                  onClick={handlePublish}
                  disabled={isLoading}
                  className="w-full py-3 bg-[#1abc9c] text-white rounded-lg font-semibold hover:bg-[#16a085] transition-all duration-300 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Publish to Blog
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">Preview</h3>
              <div className="space-y-4">
                <h1 className="text-2xl font-bold">{researchResult?.title}</h1>
                <p className="text-muted-foreground">{researchResult?.excerpt}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#1abc9c]">{researchResult?.category}</span>
                  <span className="text-sm text-muted-foreground">•</span>
                  <span className="text-sm">{publishData.author}</span>
                </div>
                <div className="border border-border rounded-lg p-4 bg-border">
                  <img
                    src={`data:image/png;base64,${imageResult?.imageData}`}
                    alt="Preview"
                    className="w-full rounded-lg"
                  />
                </div>
                <div 
                  className="prose dark:prose-invert max-w-none overflow-y-auto max-h-96"
                  dangerouslySetInnerHTML={{ 
                    __html: writeContent
                      .replace(/^###/g, '<h3 class="text-lg font-bold mt-6 mb-3">')
                      .replace(/^##/g, '<h2 class="text-xl font-bold mt-5 mb-2">')
                      .replace(/^#/g, '<h1 class="text-3xl font-bold mt-8 mb-4">')
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
