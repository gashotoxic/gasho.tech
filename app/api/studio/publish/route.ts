import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { commitBlogChanges, commitImage, readBlogFile, type BlogFileSnapshot } from '@/lib/github'
import { buildNewPost, normalizeSlug } from '@/lib/blog-post-update'
import { publishPostToStore, type PostStore } from '@/lib/blog-publish'

export interface PublishRequest {
  title: string
  excerpt: string
  content: string
  category: string
  author: string
  imageData?: string
  imagePath?: string
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

    // Types first: `title` reaches a regex and `content` reaches the renderer, so
    // a non-string is a caller mistake (400), not a server failure (500).
    if (typeof body.title !== 'string' || typeof body.content !== 'string' || !body.title || !body.content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Generate slug from title
    const slug = normalizeSlug(body.title, body.title)
    if (!slug) {
      return NextResponse.json({ error: 'Invalid title' }, { status: 400 })
    }

    // Step 1: Commit image to GitHub (a post may have no generated image; the
    // post list write below is the part that must never be skipped)
    let imagePath = body.imagePath || '/images/AI.webp'
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

    const post = buildNewPost(
      {
        title: body.title,
        excerpt: body.excerpt,
        content: body.content,
        author: body.author,
        category: body.category,
        image: imagePath,
        published: body.published,
      },
      slug
    )

    if (!post) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Step 2: read-merge-write the FULL post list.
    // This route used to commit `{ posts: [thisOnePost] }`, which replaced every
    // other post in data/blogs.json. Never write a list we did not read first.
    let snapshot: BlogFileSnapshot | null = null
    const store: PostStore = {
      read: async () => {
        snapshot = await readBlogFile()
        return snapshot.posts
      },
      write: (posts, commitMessage) =>
        commitBlogChanges(
          JSON.stringify({ posts }, null, 2),
          commitMessage,
          // Pinning the SHA read above makes a concurrent commit fail (409)
          // rather than get silently overwritten.
          snapshot?.sha
        ),
    }

    const published = await publishPostToStore(store, post)
    if (!published.success) {
      console.error('Blog commit failed:', published.error)

      // A sha conflict means someone else committed between our read and write.
      // That is a retryable client condition, not a server fault — say so.
      if (published.status === 409) {
        return NextResponse.json(
          {
            error:
              'data/blogs.json changed while this post was being saved, so nothing was overwritten. Publish again.',
            code: 'conflict',
          },
          { status: 409 }
        )
      }

      // Detail stays in the server log; the caller gets a fixed message.
      return NextResponse.json(
        { error: 'Could not commit the post to GitHub. Check server logs.', code: 'commit-failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      slug,
      title: post.title,
      githubUrl: published.url,
      imagePath,
      imageCommitted,
      created: published.created,
      postCount: published.posts.length,
    })
  } catch (error) {
    console.error('Publish failed:', error)
    return NextResponse.json(
      { error: 'Publish failed' },
      { status: 500 }
    )
  }
}
