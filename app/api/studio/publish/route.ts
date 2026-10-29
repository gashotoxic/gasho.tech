import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import {
  commitBlogChanges,
  commitImage,
  deleteImage,
  readBlogFile,
  type BlogFileSnapshot,
} from '@/lib/github'
import { buildNewPost, normalizeSlug } from '@/lib/blog-post-update'
import { publishPostToStore, type PostStore } from '@/lib/blog-publish'

/**
 * Stored hero images live under `public/images`. Anything else (an off-site URL,
 * a traversal, a data: URI) is not a file this site serves, and `next/image`
 * would fail on it at render time — so it never reaches the post.
 *
 * `..` is rejected outright: the character class alone accepts
 * `/images/../../etc/passwd`, which is a traversal even if today it only yields a
 * broken image URL.
 */
const SAFE_IMAGE_PATH = /^\/images\/(?!.*\.\.)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/

/** `imageData` is committed under this directory (see `public/images/blog`). */
const IMAGE_DIRECTORY = 'public/images/blog'

/** Guard for anything that will be stored as a hero image path. */
export function isSafeImagePath(value: unknown): boolean {
  return typeof value === 'string' && SAFE_IMAGE_PATH.test(value)
}

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

    // Step 1: read the live post list BEFORE building anything.
    //
    // Two reasons. A re-publish must carry the archived post's date and hero
    // image over (see buildNewPost), and a read failure has to stop the publish
    // here: nothing has been written yet, so it is reported as `read-failed`
    // rather than as a failed commit.
    let snapshot: BlogFileSnapshot
    try {
      snapshot = await readBlogFile()
    } catch (error) {
      console.error('Blog read failed:', error)
      return NextResponse.json(
        {
          error:
            'Could not read data/blogs.json, so nothing was written. Try again — check the server logs if it keeps failing.',
          code: 'read-failed',
        },
        { status: 500 }
      )
    }

    const archived =
      snapshot.posts.find((candidate) => candidate.slug === slug) ?? undefined

    // Step 2: commit the image (a post may have no generated image; the post list
    // write below is the part that must never be skipped).
    //
    // `imagePath` is stored as the post's hero image and reaches `next/image`, so
    // an off-site or malformed value would break the rendered page rather than
    // just look wrong. Keep the archived image (or the house default) instead of
    // trusting the body.
    const requestedImagePath = typeof body.imagePath === 'string' ? body.imagePath : ''
    if (requestedImagePath && !isSafeImagePath(requestedImagePath)) {
      console.warn('Ignoring unusable imagePath:', requestedImagePath)
    }

    // `undefined` means "the caller named no hero image", which is what lets a
    // re-publish keep the archived one instead of resetting it.
    let imagePath: string | undefined = isSafeImagePath(requestedImagePath)
      ? requestedImagePath
      : undefined
    let imageCommitted = false
    // Set only when this request committed an image: a rejected post write may
    // undo exactly that commit, and nothing else.
    let committedImageTarget: string | undefined
    let committedImageSha: string | undefined

    if (typeof body.imageData === 'string' && body.imageData.trim()) {
      const target = `${IMAGE_DIRECTORY}/${slug}.webp`
      const imageResult = await commitImage(
        body.imageData,
        target,
        `feat(blog): add image for "${body.title}"`
      )

      if (imageResult.success) {
        imagePath = `/images/blog/${slug}.webp`
        imageCommitted = true
        committedImageTarget = target
        committedImageSha = imageResult.sha
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
      slug,
      archived
    )

    if (!post) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Step 3: merge the post into the full list and write it.
    // This route used to commit `{ posts: [thisOnePost] }`, which replaced every
    // other post in data/blogs.json. Never write a list we did not read first.
    const store: PostStore = {
      // The list read in step 1 is what gets merged into — reading again would
      // only give a second chance to lose the archived metadata.
      read: async () => snapshot.posts,
      write: (posts, commitMessage) =>
        commitBlogChanges(
          JSON.stringify({ posts }, null, 2),
          commitMessage,
          // Pinning the SHA read above makes a concurrent commit fail (409)
          // rather than get silently overwritten.
          snapshot.sha
        ),
    }

    const published = await publishPostToStore(
      store,
      post,
      archived ? `feat(blog): update "${post.title}"` : `feat(blog): publish "${post.title}"`
    )
    if (!published.success) {
      console.error('Blog commit failed:', published.error)

      // The image commit landed before this one (the post must not point at a
      // file that does not exist yet). If the post never existed, nothing
      // references that image: remove it instead of leaving an orphan commit on
      // main. An existing post keeps its image — the file is its hero image.
      if (!archived && committedImageTarget && committedImageSha) {
        const cleanup = await deleteImage(
          committedImageTarget,
          committedImageSha,
          `chore(blog): drop unused image for "${post.title}"`
        )
        if (!cleanup.success) {
          console.warn('Could not remove the orphaned image commit:', cleanup.error)
        }
      }

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
      imagePath: post.image,
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
