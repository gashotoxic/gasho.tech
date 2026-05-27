import { NextResponse } from 'next/server'
import { webSearch, callLLM } from '@/lib/studio-api'

const SYSTEM_PROMPT = `You are the content strategist for GashoTech (AI, Automation, Cybersecurity in Nairobi, Kenya).

Based on this topic idea and web search results, generate:
1. TITLE: SEO-optimized, max 70 chars, catchy
2. EXCERPT: Meta description quality, max 160 chars, compelling
3. TOPICS: 4-6 key subtopics to cover in the blog post
4. CATEGORY: One of [AI, AI Automation, Cybersecurity, ICT, Technology, News]

Return ONLY valid JSON:
{"title":"...","excerpt":"...","topics":["...","..."],"category":"..."}
`

export interface ResearchRequest {
  query: string
  model: string
  provider: 'chutes' | 'crofai'
}

export async function POST(request: Request) {
  try {
    const body: ResearchRequest = await request.json()

    if (!body.query || !body.model || !body.provider) {
      return NextResponse.json(
        { error: 'Missing required fields: query, model, provider' },
        { status: 400 }
      )
    }

    // Step 1: Web search
    const searchResults = await webSearch(body.query)

    // Build search snippets for context
    const searchContext = searchResults
      .map(r => `[Result]: ${r.title}\n${r.snippet}`)
      .join('\n\n')

    // Step 2: LLM generation
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Research topic: ${body.query}\n\nWeb search results:\n${searchContext}`,
      },
    ]

    const result = await callLLM(body.provider, body.model, messages, 1024, 0.7)

    // Step 3: Parse JSON (handle markdown-wrapped JSON)
    let data
    try {
      // Strip possible markdown code block fences
      let clean = result.content.trim()
      if (clean.startsWith('```')) {
        clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
      }
      // Find the first { and last } to extract only the JSON object
      const firstBrace = clean.indexOf('{')
      const lastBrace = clean.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.slice(firstBrace, lastBrace + 1)
      }
      data = JSON.parse(clean)
    } catch {
      // If JSON parsing fails, return raw content as fallback
      console.warn('JSON parsing failed, returning raw content. Content:', result.content.slice(0, 200))
      return NextResponse.json({
        title: '',
        excerpt: result.content,
        topics: [],
        category: 'Technology',
        rawContent: result.content,
      })
    }

    // Validate required fields
    if (!data.title || !data.excerpt || !data.topics || !data.category) {
      console.warn('LLM response missing required fields:', data)
      return NextResponse.json({
        title: data.title || '',
        excerpt: data.excerpt || '',
        topics: data.topics || [],
        category: data.category || 'Technology',
        warning: 'Some fields were missing or empty',
      })
    }

    return NextResponse.json({
      title: data.title,
      excerpt: data.excerpt,
      topics: data.topics,
      category: data.category,
      searchResults: searchResults.slice(0, 3), // Return top 3 for context
    })
  } catch (error) {
    console.error('Research failed:', error)
    return NextResponse.json(
      { error: 'Research generation failed' },
      { status: 500 }
    )
  }
}
