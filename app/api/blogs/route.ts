import { promises as fs } from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { isAuthorizedRequest, readAdminAuth } from "@/lib/auth"
import { buildNewPost, commitTitle, normalizeSlug, type BlogPostShape } from "@/lib/blog-post-update"
import { clearBlogReadCache, readBlogFileCached } from "@/lib/blog-read-cache"
import { commitBlogChanges, readBlogFile, readBlogFileForWrite } from "@/lib/github"
import {
  deletePostFromStore,
  publicPosts,
  publishPostToStore,
  updatePostInStore,
  type PostStore,
  type StoreFailure,
} from "@/lib/blog-publish"

const DATA_FILE = path.join(process.cwd(), "data", "blogs.json")

type BlogPost = BlogPostShape

/**
 * How old the *build-time* copy of `data/blogs.json` may be before it stops being
 * served as a fallback.
 *
 * The snapshot exists so a GitHub outage does not blank the blog. It must not
 * become the blog: a deployment whose archive is missing from the repository (or
 * whose token lost access) served this list forever, signalled by nothing but a
 * `console.warn`. Past this age the snapshot is too stale to be worth serving —
 * every post published since that build is missing from it — so the route answers
 * 503 instead, which is loud, uncacheable and alertable.
 *
 * Age is the file's mtime: a Vercel deployment is built from a fresh checkout, so
 * that is the build. A timestamp that is not plausible (unset, epoch, in the
 * future) is reported as unknown and does *not* trip the bound — a nonsense clock
 * must not be able to take the blog offline by itself. The
 * `X-Blog-Source: snapshot` header is the primary signal either way.
 */
export const MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000

/** Where a served list came from, echoed as `X-Blog-Source`. */
export type BlogSource = "live" | "snapshot"

interface ReadResult {
  posts: BlogPost[]
  source: BlogSource
  /** True when the deployed snapshot's age could not be established. */
  snapshotAgeUnknown?: boolean
  snapshotAgeMs?: number
}

/** The copy shipped with the build. Read-only on Vercel, and only ever a fallback. */
async function readSnapshotPosts(): Promise<{ posts: BlogPost[]; builtAt: number | null } | null> {
  try {
    const stat = await fs.stat(DATA_FILE)
    const raw = await fs.readFile(DATA_FILE, "utf-8")
    const parsed = JSON.parse(raw) as { posts?: unknown }
    if (!Array.isArray(parsed.posts)) return null
    return { posts: parsed.posts as BlogPost[], builtAt: stat.mtimeMs }
  } catch {
    return null
  }
}

/**
 * Read the live archive — through the memo when the caller is anonymous, live
 * when it is the admin panel (which must see the list it just wrote).
 *
 * Returns `null` when the repository says the file does not exist. That is a
 * failure here, not an empty archive: see `readPostsForRead`.
 */
async function readLivePosts(cached: boolean): Promise<BlogPost[] | null> {
  const snapshot = cached ? await readBlogFileCached() : await readBlogFile()
  return snapshot.missing ? null : snapshot.posts
}

/**
 * Read for the public GET.
 *
 * The live `data/blogs.json` is the source of truth: the deployed copy is a
 * build-time snapshot, so serving that as "the blog" hands readers a list that
 * is missing everything published since the last deploy. When the repository
 * cannot be read (no token locally, GitHub down) the snapshot is still better
 * than nothing.
 *
 * `missing: true` is a read failure too, and this is the one place that decides
 * so for reads. A 404 from the contents API arrives as
 * `{ posts: [], missing: true }`, and taking it at face value answered 200 `[]`
 * — the whole blog rendered "No blog posts yet" with every `/blogs/<slug>` a
 * 404 — and then told every cache to keep that empty list for 60 seconds. The
 * write paths already refuse the same 404; a read has to refuse it as well and
 * fall back to the deployed snapshot.
 *
 * `null` means there is nothing honest to serve: neither the repository nor the
 * deployed snapshot has a post list, or the snapshot is older than
 * `MAX_SNAPSHOT_AGE_MS`. The caller answers 503 instead of inventing an empty
 * blog.
 */
async function readPostsForRead(
  cached: boolean,
  now: number = Date.now()
): Promise<ReadResult | null> {
  let liveFailed = false
  try {
    const live = await readLivePosts(cached)
    if (live !== null) return { posts: live, source: "live" }
    liveFailed = true
    console.warn("data/blogs.json is missing from the repository; serving the deployed snapshot")
  } catch (error) {
    liveFailed = true
    console.warn("Live blog read failed, serving the deployed snapshot:", error)
  }

  const snapshot = await readSnapshotPosts()
  if (!snapshot || snapshot.posts.length === 0) {
    if (liveFailed) {
      console.error("Neither the repository nor the deployed snapshot holds a post list")
    }
    return null
  }

  // A snapshot older than the bound is not served: the blog would be lying about
  // everything published since that build, indefinitely, and nothing would say so.
  const age = plausibleAge(snapshot.builtAt, now)
  if (age === null) {
    console.error(
      `Serving the deployed snapshot, but its age cannot be established (mtime ${snapshot.builtAt}); the ${MAX_SNAPSHOT_AGE_MS / 3_600_000}h bound is not applied`
    )
  } else if (age > MAX_SNAPSHOT_AGE_MS) {
    console.error(
      `The deployed snapshot is ${Math.round(age / 3_600_000)}h old and the live archive is unreadable; answering 503 rather than serving a snapshot older than ${MAX_SNAPSHOT_AGE_MS / 3_600_000}h`
    )
    return null
  } else {
    console.warn(
      `Serving the deployed snapshot (${Math.round(age / 60_000)}m old, limit ${MAX_SNAPSHOT_AGE_MS / 3_600_000}h)`
    )
  }

  return {
    posts: snapshot.posts,
    source: "snapshot",
    snapshotAgeMs: age ?? undefined,
    snapshotAgeUnknown: age === null,
  }
}

/**
 * Age of a build stamp, or `null` when the stamp is not usable.
 *
 * A stored mtime can be missing, zero or (across a clock change) in the future.
 * None of those is evidence that the snapshot is stale, and a wrong 503 takes the
 * blog offline — so an implausible stamp disables the bound instead of tripping
 * it. The `X-Blog-Source: snapshot` header still reports where the list came from.
 */
function plausibleAge(builtAt: number | null, now: number): number | null {
  if (typeof builtAt !== "number" || !Number.isFinite(builtAt) || builtAt <= 0) return null
  const age = now - builtAt
  return age < 0 ? 0 : age
}

/**
 * A store over the live file for the write handlers.
 *
 * `read` is `readBlogFileForWrite()`: it has no cache and no snapshot fallback,
 * and it refuses a file the repository does not have. Writing a list the server
 * could not read is the bug that let one request resurrect a deleted post and
 * wipe everything published since the build. A 404 from the contents API is a
 * bad ref, a token without access or an outage — not "the archive is empty" —
 * and treating it as empty replaced 73 posts with the one being written.
 *
 * The sha comes back *with* the list and `write` has to name it, so a concurrent
 * change fails (409) instead of being silently overwritten. Both routes get that
 * invariant from `lib/blog-publish.ts`; there is no unpinned write left to drop
 * the argument from.
 */
function createBlogStore(): PostStore {
  return {
    read: readBlogFileForWrite,
    write: (posts, commitMessage, sha) =>
      commitBlogChanges(JSON.stringify({ posts }, null, 2), commitMessage, sha),
  }
}

/**
 * One place that turns a refused write into a response, so every handler reports
 * a read failure, a missing post, a slug collision and a lost race consistently.
 * Detail goes to the server log; the caller gets a fixed message.
 */
function failureResponse(failure: StoreFailure) {
  console.error("Blog write refused:", failure.code, failure.error)

  switch (failure.code) {
    case "read-failed":
      return NextResponse.json(
        {
          error:
            "Could not read the live post list, so nothing was written. Try again — check the server logs if it keeps failing.",
          code: "read-failed",
        },
        { status: 500 }
      )
    case "exists":
      return NextResponse.json({ error: failure.error, code: "exists" }, { status: 409 })
    case "not-found":
      return NextResponse.json({ error: failure.error }, { status: 404 })
    case "conflict":
      // Someone else committed between our read and our write. Retryable, and
      // explicitly not a data loss: the other commit won.
      return NextResponse.json(
        {
          error:
            "data/blogs.json changed while this change was being saved, so nothing was overwritten. Try again.",
          code: "conflict",
        },
        { status: 409 }
      )
    default:
      return NextResponse.json(
        { error: "Could not commit the change to GitHub. Check server logs.", code: "commit-failed" },
        { status: 500 }
      )
  }
}

/**
 * The public blog index and each post page read this route, unauthenticated.
 *
 * They must not see drafts, and they used to: the handler returned the whole
 * file, `published: false` posts and their bodies included. An admin session
 * (`Bearer` token) still gets the full list, because the admin panel edits
 * drafts — everyone else gets the published archive only. Published bodies are
 * returned as stored: they are the rendered pages, so nothing is disclosed that
 * the site does not already serve at `/blogs/<slug>`.
 *
 * A header that is present but does not verify is answered 401, not with the
 * anonymous projection. Answering 200 hid expiry — the admin panel reloaded its
 * list, got published posts back, and showed every draft as gone with no "sign
 * in again" — so the panel's 401 branch could never fire. No header at all is
 * still an anonymous read.
 */
export async function GET(request: Request) {
  const auth = readAdminAuth(request)

  if (auth === "invalid") {
    return NextResponse.json(
      { error: "Unauthorized", code: "invalid-token" },
      // Never cached: a failed session must not be replayed from a cache, and a
      // 401 is not the public list.
      { status: 401, headers: { "Cache-Control": "private, no-store" } }
    )
  }

  const isAdmin = auth === "admin"

  // An admin read goes straight to the repository: the panel reloads its list
  // right after a save and must not be handed a memoised copy older than the
  // write it just made.
  const result = await readPostsForRead(!isAdmin)
  if (!result) {
    return NextResponse.json(
      {
        error:
          "The blog archive could not be read, so this is not an empty blog. Try again shortly.",
        code: "read-failed",
      },
      // No cache: "unavailable for a moment" must not be pinned onto the URL.
      // `X-Blog-Source: none` separates "no honest list to serve" from a real
      // empty archive, for anything watching headers instead of bodies.
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "X-Blog-Source": "none" },
      }
    )
  }

  // A public read of a page that must never be cached across users: the response
  // differs by Authorization, so say so, and let a shared cache hold only the
  // published projection (the list is larger than the pages that need it, and
  // every anonymous request would otherwise pull the whole file from GitHub).
  //
  // Caveat: Vercel's CDN does not key on `Vary`, so an admin can be served the
  // cached *published-only* list for up to 60s. No draft can leak (admin
  // responses are private/no-store and are never stored), and an expired session
  // now answers 401 instead of a silent projection; a short-lived stale list is
  // the remaining cost, and it heals in under a minute.
  const headers: Record<string, string> = isAdmin
    ? { "Cache-Control": "private, no-store", Vary: "Authorization" }
    : { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300", Vary: "Authorization" }

  // Where the list came from, on the response: `live` is the repository, and
  // `snapshot` means GitHub was unreadable and the readers are being handed the
  // build-time copy. Without this the fallback was invisible — a log line nobody
  // reads — and a deployment could serve a months-old archive with every
  // monitoring check green. Alert on `X-Blog-Source: snapshot`, and on `none`.
  headers["X-Blog-Source"] = result.source
  if (result.source === "snapshot") {
    if (typeof result.snapshotAgeMs === "number") {
      headers["X-Blog-Snapshot-Age"] = String(Math.round(result.snapshotAgeMs / 1000))
    } else {
      headers["X-Blog-Snapshot-Age"] = "unknown"
    }
  }

  return NextResponse.json(isAdmin ? result.posts : publicPosts(result.posts), { headers })
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const raw = await request.json()
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    const candidate = raw as Record<string, unknown>
    if (typeof candidate.title !== "string" || typeof candidate.content !== "string") {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 })
    }

    const derivedSlug = candidate.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    const slug = normalizeSlug(candidate.slug, derivedSlug)
    if (!slug) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 })
    }

    const newPost = buildNewPost(candidate, slug)
    if (!newPost) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 })
    }

    // This is a *create*: an archived slug is refused rather than replaced, so a
    // "new post" form can never silently overwrite a published post.
    const result = await publishPostToStore(
      createBlogStore(),
      newPost,
      `feat(blog): add post "${commitTitle(newPost.title)}"`,
      { refuseExisting: true }
    )
    if (!result.success) return failureResponse(result)

    // A write in this process drops the anonymous read memo: the new post must be
    // reachable now, not after the TTL, and the old list must stop being served.
    clearBlogReadCache()

    return NextResponse.json(newPost, { status: 201 })
  } catch (err) {
    console.error("Blog POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const raw = await request.json()
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    const body = raw as Record<string, unknown>

    const slug = normalizeSlug(body.slug, "")
    if (!slug) {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 })
    }

    // Field-by-field against the post as stored now: the caller may not rewrite
    // the slug, the date, or inject arbitrary keys, and the rest of the list is
    // carried over untouched.
    const result = await updatePostInStore(createBlogStore(), slug, body)
    if (!result.success) return failureResponse(result)

    clearBlogReadCache()

    return NextResponse.json(result.post)
  } catch (err) {
    console.error("Blog PUT error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const requested = searchParams.get("slug")
    const slug = requested ? normalizeSlug(requested, "") : null
    if (!slug) {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 })
    }

    const result = await deletePostFromStore(createBlogStore(), slug)
    if (!result.success) return failureResponse(result)

    // A deleted post must stop being served to anonymous readers immediately.
    clearBlogReadCache()

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Blog DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
