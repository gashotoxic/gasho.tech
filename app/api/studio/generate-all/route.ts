import { NextResponse } from 'next/server'
import { webSearch, callLLM } from '@/lib/studio-api'

const PUBLIC_MODEL = 'glm-4.7-flash'
const PUBLIC_PROVIDER = 'crofai'

const SYSTEM_PROMPT = `You are a professional blog writer for GashoTech — an AI, Automation, and Cybersecurity company based in Nairobi, Kenya.

Based on the research topic and web search results below, generate everything needed for a complete blog post.

Return ONLY valid JSON with this exact structure:
{
  "title": "SEO-optimized blog title, max 70 chars",
  "excerpt": "Meta description, max 160 chars",
  "topics": ["topic 1", "topic 2", "topic 3", "topic 4"],
  "category": "One of: AI, AI Automation, Cybersecurity, ICT, Technology, News",
  "content": "Full 1000-1500 word blog post in Markdown with H1, H2, H3 headings, bullet lists, internal links marked as [INTERNAL: topic], and a conclusion with CTA. Write from an East African / Kenyan tech perspective.",
  "imagePrompt": "A detailed prompt for generating a 1200x630 blog header image. Style: dark background with turquoise #1abc9c accents, tech aesthetic, enhanced human with subtle tech elements. Describe the scene, lighting, colors, and composition."
}`

export interface GenerateAllRequest {
  query: string
  model?: string
  provider?: 'chutes' | 'crofai'
}

export async function POST(request: Request) {
  try {
    const body: GenerateAllRequest = await request.json()

    if (!body.query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      )
    }

    // Determine model and provider
    const model = body.model || PUBLIC_MODEL
    const provider = body.provider || PUBLIC_PROVIDER

    // Step 1: Web search
    const searchResults = await webSearch(body.query)
    const searchContext = searchResults
      .map(r => `[Result]: ${r.title}\n${r.snippet}`)
      .join('\n\n')

    // Step 2: LLM generates everything in one call
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Research topic: ${body.query}\n\nWeb search results:\n${searchContext}`,
      },
    ]

    const result = await callLLM(provider, model, messages, 8192, 0.7)

    // Step 3: Parse JSON (handle markdown-wrapped JSON + extra text)
    let data
    try {
      let clean = result.content.trim()
      if (clean.startsWith('```')) {
        clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
      }
      const firstBrace = clean.indexOf('{')
      const lastBrace = clean.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.slice(firstBrace, lastBrace + 1)
      }
      data = JSON.parse(clean)
    } catch {
      console.error('JSON parse failed in generate-all. Raw:', result.content.slice(0, 500))
      return NextResponse.json(
        { error: 'Failed to parse AI response. Please try again.' },
        { status: 500 }
      )
    }

    // Validate required fields
    if (!data.title || !data.content) {
      console.error('Missing required fields:', data)
      return NextResponse.json(
        { error: 'AI response was incomplete. Please try a different topic.' },
        { status: 500 }
      )
    }

    // Count words
    const wordCount = data.content.trim().split(/\s+/).length

    return NextResponse.json({
      title: data.title,
      excerpt: data.excerpt || '',
      topics: data.topics || [],
      category: data.category || 'Technology',
      content: data.content,
      imagePrompt: data.imagePrompt || '',
      wordCount,
      searchResults: searchResults.slice(0, 3),
    })
  } catch (error) {
    console.error('Generate-all failed:', error)
    const errorMsg = error instanceof Error ? error.message : 'unknown error'
    return NextResponse.json(
      { error: `Generation failed: ${errorMsg}. Try switching models or try again.` },
      { status: 500 }
    )
  }
}
