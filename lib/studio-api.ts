// Shared API helpers for Blog Content Studio
// Handles Chutes and DuckDuckGo web search

// --- Configuration ---

const CHUTES_API_KEY = process.env.CHUTES_API_KEY || ''
const CHUTES_BASE_URL = 'https://llm.chutes.ai/v1'
const CHUTES_IMAGE_URL = 'https://chutes-z-image-turbo.chutes.ai/generate'
const CHUTES_IMAGE_FALLBACK_URL = 'https://chutes-z-image-pro.chutes.ai/generate'

// --- Types ---

export interface LLMResult {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}

export interface SearchResult {
  url: string
  title: string
  snippet: string
}

export interface ImageResult {
  imageData: string
  success: boolean
  error?: string
  source: string
}

// --- Chutes LLM ---

export async function callChutesLLM(
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens = 4096,
  temperature = 0.7
): Promise<LLMResult> {
  if (!CHUTES_API_KEY) {
    throw new Error('CHUTES_API_KEY not configured')
  }

  try {
    const response = await fetch(`${CHUTES_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CHUTES_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Chutes API error ${response.status}: ${errorText}`)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content || ''

    return {
      content,
      usage: data?.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
          }
        : undefined,
    }
  } catch (error) {
    throw new Error(`Chutes LLM call failed: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
}

// --- Unified LLM Call ---

export type LLMProvider = 'chutes'

export async function callLLM(
  provider: LLMProvider,
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens = 4096,
  temperature = 0.7
): Promise<LLMResult> {
  if (provider !== 'chutes') {
    throw new Error(`Unsupported provider: ${provider}`)
  }
  return callChutesLLM(model, messages, maxTokens, temperature)
}

// --- DuckDuckGo Web Search ---

export async function webSearch(query: string): Promise<SearchResult[]> {
  try {
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    )

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed: ${response.status}`)
    }

    const html = await response.text()

    // Extract results from HTML
    const results: SearchResult[] = []

    // Pattern 1: Extract result snippets
    const snippetRegex = /<a[^>]*class=["']result__snippet["'][^>]*>(.*?)<\/a>/gs
    let snippetMatch
    while ((snippetMatch = snippetRegex.exec(html)) !== null) {
      results.push({
        url: '',
        title: '',
        snippet: stripHTML(snippetMatch[1]).trim(),
      })
    }

    // Pattern 2: Extract result URLs and titles
    const resultRegex = /<a[^>]*class=["']result__a[^"]*["'][^>]*href=["']([^"]*)["'][^>]*>(.*?)<\/a>/gs
    let resultMatch
    while ((resultMatch = resultRegex.exec(html)) !== null) {
      const url = resultMatch[1]
      const title = stripHTML(resultMatch[2]).trim()

      // Find matching snippet
      const snippet = results.find(r => r.url === url)
      results.push({
        url,
        title,
        snippet: snippet?.snippet || '',
      })
    }

    // Pattern 3: Fallback extraction
    if (results.length === 0) {
      const resultsRegex = /<a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>(.*?)<\/a>/gs
      let m
      let count = 0
      while ((m = resultsRegex.exec(html)) !== null && count < 5) {
        const url = m[1]
        const title = stripHTML(m[2]).trim()
        if (url && title && !url.includes('duckduckgo.com')) {
          results.push({ url, title, snippet: '' })
          count++
        }
      }
    }

    return results.slice(0, 5)
  } catch (error) {
    console.error('Web search failed:', error)
    return []
  }
}

function stripHTML(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

// --- Image Generation with Fallback Chain ---

export async function generateImage(
  prompt: string,
  retryCount = 2
): Promise<ImageResult> {
  const endpoints = [CHUTES_IMAGE_URL, CHUTES_IMAGE_FALLBACK_URL]

  for (let i = 0; i <= retryCount && i < endpoints.length; i++) {
    try {
      const response = await fetch(endpoints[i], {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CHUTES_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      })

      if (!response.ok) {
        throw new Error(`Image gen failed: ${response.status}`)
      }

      const data = await response.json()
      const imageData = data?.image || data?.imageData || data?.b64_json || ''

      if (!imageData) {
        throw new Error('No image data in response')
      }

      return {
        imageData,
        success: true,
        source: endpoints[i],
      }
    } catch (error) {
      console.warn(`Image generation attempt ${i + 1} failed:`, error)
      if (i === endpoints.length - 1) {
        return {
          imageData: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          source: endpoints[i],
        }
      }
      // Continue to next endpoint
    }
  }

  return {
    imageData: '',
    success: false,
    error: 'All image generation endpoints failed',
    source: 'none',
  }
}

// --- Model Listing ---

export async function getProviderModels(): Promise<Array<{
  id: string
  name: string
  provider: LLMProvider
  description?: string
}>> {
  // Curated model list — display names are human-friendly; `id` (full API model id)
  // is what goes into every API call. Verified live on Chutes 2026-10-11.
  const models: Array<{ id: string; name: string; provider: LLMProvider; description?: string }> = [
    { id: 'google/gemma-4-31B-turbo-TEE', name: 'Gemma4', provider: 'chutes', description: 'Balanced writer — default for blog generation' },
    { id: 'GLM-4.7-Flash-NVFP4-TEE', name: 'GLM-4.7', provider: 'chutes', description: 'Fast, light tasks' },
    { id: 'Nemotron-3-Nano-Omni-30B-TEE', name: 'Nemotron 3 Omni', provider: 'chutes', description: 'Multimodal omni model' },
    { id: 'meta/Muse-Glimmer-30B-NVFP4-TEE', name: 'Muse Glimmer', provider: 'chutes', description: 'Creative / image-adjacent work' },
  ]

  return models
}

// --- Markdown Rendering ---

/**
 * Escape text for HTML text/attribute context.
 *
 * `renderMarkdown` output feeds `dangerouslySetInnerHTML`, so anything the
 * author typed that looks like markup becomes inert text instead of live DOM.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Only targets that cannot execute script survive. With `"` already escaped an
// attribute cannot be broken out of, so the remaining hole is `javascript:` /
// `data:` — an allowlist of schemes is the simplest thing that cannot rot.
// `//host` (protocol-relative, i.e. off-site) is excluded on purpose: a post may
// link off-site only by naming its scheme.
const SAFE_LINK_HREF = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#|\.{1,2}\/)/i

/**
 * Return the href when it is a target an author may legitimately link to, else
 * `null` (the link is rendered as inert text).
 */
function safeLinkHref(href: string): string | null {
  const candidate = href.trim()
  if (!candidate) return null
  return SAFE_LINK_HREF.test(candidate) ? candidate : null
}

export function renderMarkdown(md: string): string {
  if (typeof md !== 'string' || !md) return ''

  // Escape FIRST. Raw HTML in a post body must render as inert text — this
  // output is injected with dangerouslySetInnerHTML, next to the admin token in
  // localStorage, so `<img onerror>` in a post body used to be stored XSS.
  // Every tag below is generated by this function, after escaping.
  let html = escapeHtml(md)

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Links — only safe schemes become anchors. An unsafe href keeps the author's
  // original (already escaped) text, so a rejected link reads as text instead of
  // silently losing its tail.
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, text: string, href: string) => {
    const safe = safeLinkHref(href)
    if (!safe) return match
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`
  })

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
  html = html.replace(/`(.+?)`/g, '<code>$1</code>')

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (match: string) => {
    // Check if it's a header separator row (|---|)
    if (/^\|[\s-:]+\|$/.test(match)) return match // skip separator rows, they'll be handled below
    const cells = match.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1 || (arr.length > 2 && i === arr.length - 1))
      .map(c => c.trim())
    if (cells.length === 0) return match
    return `<td>${cells.join('</td><td>')}</td>`
  })
  // Wrap consecutive <td> rows in <tr> and then <table>
  html = html.replace(/((?:<td>.*?<\/td>\n?)+)/g, '<tr>$1</tr>')
  html = html.replace(/((?:<tr>.*?<\/tr>\n?)+)/g, '<table class="w-full border-collapse border border-border my-4">$1</table>')
  // Style table cells
  html = html.replace(/<td>/g, '<td class="border border-border px-3 py-2 text-sm">')

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // Line breaks
  html = html.replace(/\n\n/g, '<br><br>')
  html = html.replace(/\n/g, '<br>')

  return html
}

