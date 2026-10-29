import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import {
  commitBlogChanges,
  commitImage,
  deleteImage,
  readBlogFile,
  type BlogFileSnapshot,
} from '@/lib/github'
import {
  HOUSE_IMAGE_PATH,
  MAX_SLUG_LENGTH,
  buildNewPost,
  normalizeSlug,
  slugify,
  type BlogPostShape,
} from '@/lib/blog-post-update'
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

/** The file half of a stored image value, dropping any `?v=` cache-buster. */
function pathOnly(value: string): string {
  return value.split(/[?#]/)[0]
}

/**
 * Guard for anything that will be stored as a hero image path.
 *
 * A query string is accepted and preserved: five archived posts store
 * `/images/<slug>.webp?v=3` as a cache-buster. Rejecting those would make any
 * caller that prefills a post's stored image (the studio, an edit form, a future
 * re-publish) fall back to the house image and silently rewrite that post's hero —
 * so only the path half is validated, because only the path half names a file.
 */
export function isSafeImagePath(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return SAFE_IMAGE_PATH.test(pathOnly(value))
}

/** Titles are matched to the archive after collapsing whitespace and case. */
function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Find the archived post a caller means when they send no slug.
 *
 * 64 of the 73 posts in `data/blogs.json` have a slug that is *not* the slugified
 * title (they were written before the studio derived slugs from titles), so
 * deriving the slug alone appended a duplicate instead of editing the post.
 *
 * The first match wins. The archive already holds one deliberate duplicate-title
 * pair from the old append bug; picking the earliest keeps the choice stable
 * rather than "whichever is found first today".
 */
function findArchivedByTitle(
  posts: readonly BlogPostShape[],
  title: string
): BlogPostShape | undefined {
  const wanted = normalizeTitle(title)
  return posts.find((post) => typeof post.title === 'string' && normalizeTitle(post.title) === wanted)
}

export interface PublishRequest {
  /** Optional: the stored slug, when the caller is editing a known post. */
  slug?: string
  title: string
  excerpt: string
  content: string
  category: string
  author: string
  imageData?: string
  /** Optional: an explicit hero-image override. Omit it to keep the archived one. */
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
    //
    // Whitespace counts as missing: `buildNewPost` trims, so `"   "` would pass
    // this check, commit the hero image, and then be refused with nothing
    // referencing that commit.
    if (
      typeof body.title !== 'string' ||
      typeof body.content !== 'string' ||
      !body.title.trim() ||
      !body.content.trim()
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Slug resolution. An explicit `slug` from the client wins (`/api/blogs` POST
    // has always accepted one); otherwise it is derived from the title, and any
    // exact title match in the archive below re-points it at the stored slug.
    //
    // A too-long title is reported as what it is: `normalizeSlug` returns null for
    // both "too long" and "nothing sluggable", and "Invalid title" for a title
    // that is merely long sent the caller looking for a syntax problem that does
    // not exist.
    const derivedSlug = slugify(body.title)
    if (derivedSlug.length > MAX_SLUG_LENGTH) {
      return NextResponse.json(
        {
          error: `This title becomes a ${derivedSlug.length}-character URL, and the limit is ${MAX_SLUG_LENGTH}. Shorten the title and publish again.`,
          code: 'title-too-long',
        },
        { status: 400 }
      )
    }

    const explicitSlug = normalizeSlug(body.slug, '')
    if (body.slug !== undefined && !explicitSlug) {
      // A slug the caller *did* send must be usable. Silently falling back to the
      // title would let a typo'd slug publish over an existing post instead of
      // failing loudly.
      return NextResponse.json(
        {
          error:
            'That slug cannot be used: letters, numbers and dashes only, up to 120 characters.',
          code: 'invalid-slug',
        },
        { status: 400 }
      )
    }
    let slug = explicitSlug ?? derivedSlug
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
      snapshot.posts.find((candidate) => candidate.slug === slug) ??
      // Only when the slug was derived from the title: an explicit slug is a
      // request for that URL, and the caller may be publishing a second post that
      // shares a title (a regional copy, a follow-up).
      (explicitSlug ? undefined : findArchivedByTitle(snapshot.posts, body.title))

    // The archived slug is the post's URL, so an edit lands on it even when the
    // title slugifies differently. Without this the post was appended as a
    // duplicate under a brand-new slug and the studio still said "Published".
    if (archived) slug = archived.slug

    // Step 2: resolve the hero image.
    //
    // `imagePath` is stored as the post's hero image and reaches `next/image`, so
    // an off-site or malformed value would break the rendered page rather than
    // just look wrong. Keep the archived image (or the house default) instead of
    // trusting the body.
    //
    // The studio used to send the house default on *every* publish
    // (`imageData ? /images/blog/<slug>.webp : '/images/AI.webp'`), and browsers
    // keep serving that cached bundle, so "the caller named the house default"
    // must not be read as "replace this post's hero": an archived post that has
    // its own image keeps it. Any other safe path is still an explicit override.
    const requestedImagePath =
      typeof body.imagePath === 'string' ? body.imagePath.trim() : ''
    if (requestedImagePath && !isSafeImagePath(requestedImagePath)) {
      console.warn('Ignoring unusable imagePath:', requestedImagePath)
    }

    // `undefined` means "the caller named no hero image", which is what lets a
    // re-publish keep the archived one instead of resetting it.
    let imagePath: string | undefined
    if (isSafeImagePath(requestedImagePath)) {
      // Compare the file, not the raw value: `/images/AI.webp?v=2` is the house
      // image with a cache-buster, not an override.
      const houseDefaultOnArchivedPost =
        pathOnly(requestedImagePath) === HOUSE_IMAGE_PATH &&
        !!archived?.image &&
        pathOnly(archived.image) !== HOUSE_IMAGE_PATH
      imagePath = houseDefaultOnArchivedPost ? undefined : requestedImagePath
    }

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

    // The stored path the commit above wrote, e.g. `/images/blog/<slug>.webp`.
    const committedImagePath = committedImageTarget
      ? `/${committedImageTarget.replace(/^public\//, '')}`
      : undefined

    /** Does any post in `posts` point at the file this request just wrote? */
    const referencesCommittedImage = (posts: readonly BlogPostShape[]): boolean =>
      !!committedImagePath &&
      posts.some(
        (candidate) =>
          typeof candidate.image === 'string' && pathOnly(candidate.image) === committedImagePath
      )

    // Undo an image commit this same request made but left unreferenced.
    // Nothing points at the file, so leaving it behind is an orphan commit on
    // main.
    //
    // Two reference checks, because a wrong delete breaks a live page:
    //
    // 1. the list we read (whole list, not just the post being edited — image
    //    paths were title-derived while 64 of 73 stored slugs are not, so two
    //    posts can legitimately share a hero path), and
    // 2. the list as it is *now*. Any failed write means another writer may have
    //    committed since our read (a 409 is that case by definition), and the
    //    image path is deterministic per slug, so a concurrent writer can be
    //    pointing at the very blob we are about to delete — identical bytes
    //    commit to the same sha, so pinning the sha is not enough on its own.
    //    If the re-read fails, keep the file: a stray blob costs disk, a deleted
    //    hero breaks the page.
    //
    // Skipping *every* archived post (as this used to) meant a re-publish that
    // committed a different image and then failed its post write left an orphaned
    // blob on `main` forever.
    const discardOrphanedImage = async (title: string) => {
      if (!committedImageTarget || !committedImageSha || !committedImagePath) return
      if (referencesCommittedImage(snapshot.posts)) return

      let referenced: boolean
      try {
        const latest = await readBlogFile()
        referenced = referencesCommittedImage(latest.posts)
      } catch (error) {
        console.warn('Could not re-read the post list before removing the orphaned image:', error)
        return
      }
      if (referenced) return

      const cleanup = await deleteImage(
        committedImageTarget,
        committedImageSha,
        `chore(blog): drop unused image for "${title}"`
      )
      if (!cleanup.success) {
        console.warn('Could not remove the orphaned image commit:', cleanup.error)
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
      await discardOrphanedImage(body.title)
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
      // file that does not exist yet). If nothing references it, remove it
      // instead of leaving an orphan commit on main — the cleanup re-reads the
      // archive first, so a concurrent winner's reference is respected.
      await discardOrphanedImage(post.title)

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
