import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { commitBlogChanges, commitImage } from '@/lib/github'

export interface PublishRequest {
  title: string
  excerpt: string
  content: string
  category: string
  author: string
  imageData: string
  imagePath: string
  published: boolean
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!verifyToken(authHeader.slice(7))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: PublishRequest = await request.json()

    if (!body.title || !body.content || !body.imageData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Generate slug from title
    const slug = body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    // Step 1: Commit image to GitHub
    let imagePath = body.imagePath
    let imageCommitted = false

    if (body.imageData && body.imageData.trim()) {
      const imageResult = await commitImage(
        body.imageData,
        `public/images/blog/${slug}.webp`,
        `feat(blog): add image for "${body.title}"`
      )

      if (imageResult.success) {
        imagePath = `/images/blog/${slug}.webp`
        imageCommitted = true
      } else {
        console.warn('Image commit failed, using fallback:', imageResult.error)
      }
    }

    // Step 2: Commit blog post to GitHub
    const blogsResult = await commitBlogChanges(
      JSON.stringify({
        posts: [
          {
            slug,
            title: body.title,
            excerpt: body.excerpt,
            content: body.content,
            author: body.author || 'GashoTech Team',
            category: body.category || 'Technology',
            date: new Date().toISOString().split('T')[0],
            image: imagePath || '/images/AI.webp',
            published: body.published ?? true,
          },
        ],
      }, null, 2),
      `feat(blog): publish "${body.title}"`
    )

    if (!blogsResult.success) {
      console.error('Blog commit failed:', blogsResult.error)
      return NextResponse.json(
        { error: `Failed to commit to GitHub: ${blogsResult.error}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      slug,
      title: body.title,
      githubUrl: blogsResult.url,
      imagePath,
      imageCommitted,
    })
  } catch (error) {
    console.error('Publish failed:', error)
    return NextResponse.json(
      { error: 'Publish failed' },
      { status: 500 }
    )
  }
}
