import { NextResponse } from 'next/server'
import { callLLM } from '@/lib/studio-api'

const SYSTEM_PROMPT = `You are a professional blog writer for GashoTech — an AI, Automation, and Cybersecurity company based in Nairobi, Kenya.

Write a fully SEO-optimized blog post in Markdown format with:
- H1 title (one, at the top)
- H2 and H3 subheadings throughout
- 1000-1500 words
- Natural keyword placement (no stuffing)
- Internal linking suggestions marked as [INTERNAL: topic]
- External source references where relevant
- Bullet lists and numbered lists where appropriate
- A strong opening hook
- A conclusion with CTA (contact GashoTech at contact@gashotech.com)

Tone: Professional but accessible. Technical accuracy matters.
Brand voice: Confident, innovative, African tech perspective.

Title: {title}
Excerpt: {excerpt}
Topics to cover: {topics}
Category: {category}
Tone: {tone}

Write the full post in Markdown.
`

export interface WriteRequest {
  title: string
  excerpt: string
  topics: string[]
  category: string
  model: string
  provider: 'chutes' | 'crofai'
  tone?: string
}

export async function POST(request: Request) {
  try {
    const body: WriteRequest = await request.json()

    if (!body.title || !body.excerpt || !body.topics || !body.category || !body.model || !body.provider) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Build context from topics
    const topicsContext = body.topics.map((t, i) => `${i + 1}. ${t}`).join('\n')

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Title: ${body.title}\nExcerpt: ${body.excerpt}\n\nTopics to cover:\n${topicsContext}\n\nCategory: ${body.category}\n\nWrite the full blog post in Markdown format.`,
      },
    ]

    const result = await callLLM(body.provider, body.model, messages, 4096, 0.7)

    // Count words
    const wordCount = result.content.trim().split(/\s+/).length

    return NextResponse.json({
      content: result.content,
      wordCount,
    })
  } catch (error) {
    console.error('Write failed:', error)
    return NextResponse.json(
      { error: 'Blog post generation failed' },
      { status: 500 }
    )
  }
}
