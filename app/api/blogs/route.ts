import { NextResponse } from "next/server"
import { isAuthorizedRequest, readAdminAuth } from "@/lib/auth"
import { buildNewPost, commitTitle, normalizeSlug, type BlogPostShape } from "@/lib/blog-post-update"
import { clearBlogReadCache, readBlogFileCached } from "@/lib/blog-read-cache"
import {
  SNAPSHOT_WARN_AGE_MS,
  readBlogSnapshot,
  snapshotAgeVerdict,
  type SnapshotAgeState,
} from "@/lib/blog-snapshot"
import { commitBlogChanges, readBlogFile, readBlogFileForWrite } from "@/lib/github"
import {
  deletePostFromStore,
  publicPosts,
  publishPostToStore,
  updatePostInStore,
  type PostStore,
  type StoreFailure,
} from "@/lib/blog-publish"

type BlogPost = BlogPostShape

/** Where a served list came from, echoed as `X-Blog-Source`. */
export type BlogSource = "live" | "snapshot"

interface ReadResult {
  posts: BlogPost[]
  source: BlogSource
  /** True when the deployed snapshot's age could not be established. */
  snapshotAgeUnknown?: boolean
  snapshotAgeMs?: number
  /** `fresh` | `stale` | `unknown` — the fallback's standing, for the headers. */
  snapshotAgeState?: SnapshotAgeState
  /** Which anchor the age came from: the deployment's build stamp, or the mtime. */
  snapshotAnchor?: "build" | "mtime"
}


/** The copy shipped with the build. Read-only on Vercel, and only ever a fallback. */

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
 * deployed snapshot has a post list, or the snapshot is past
 * `MAX_SNAPSHOT_AGE_MS`. The caller answers 503 instead of inventing an empty
 * blog.
 *
 * Between `SNAPSHOT_WARN_AGE_MS` (24 h) and `MAX_SNAPSHOT_AGE_MS` (48 h) the
 * snapshot is still served, but it is marked: a warning in the log and
 * `X-Blog-Snapshot-Stale: 1` on the response. A single cliff meant a deployment
 * 24 h and 1 s old flipped the blog from serving to 503 on the clock alone, with
 * no step where anyone could see it coming.
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

  const snapshot = await readBlogSnapshot()
  if (!snapshot || snapshot.posts.length === 0) {
    if (liveFailed) {
      console.error("Neither the repository nor the deployed snapshot holds a post list")
    }
    return null
  }

  // The age anchor is the deployment's build stamp when there is one, and the
  // file's mtime only as a local fallback — see lib/blog-snapshot.ts.
  const verdict = snapshotAgeVerdict(snapshot.builtAt, now)
  const ageMs = verdict.ageMs ?? 0
  const limitHours = Math.round(verdict.limitMs / 3_600_000)

  if (verdict.state === "expired") {
    console.error(
      `The deployed snapshot is ${Math.round(ageMs / 3_600_000)}h old (anchor: ${snapshot.builtAtSource}) ` +
        `and the live archive is unreadable; answering 503 rather than serving a snapshot past ${limitHours}h`
    )
    return null
  }

  if (verdict.state === "unknown") {
    console.error(
      `Serving the deployed snapshot, but its age cannot be established (anchor: ${snapshot.builtAtSource}); ` +
        `the ${limitHours}h bound is not applied`
    )
  } else if (verdict.state === "stale") {
    console.warn(
      `Serving the deployed snapshot (${Math.round(ageMs / 3_600_000)}h old, anchor: ${snapshot.builtAtSource}): ` +
        `past the ${Math.round(SNAPSHOT_WARN_AGE_MS / 3_600_000)}h warning and refused at ${limitHours}h. ` +
        `The live archive has not been readable since that build.`
    )
  } else {
    console.warn(
      `Serving the deployed snapshot (${Math.round(ageMs / 60_000)}m old, anchor: ${snapshot.builtAtSource}, ` +
        `limit ${limitHours}h)`
    )
  }

  return {
    posts: snapshot.posts,
    source: "snapshot",
    snapshotAgeMs: verdict.ageMs ?? undefined,
    snapshotAgeUnknown: verdict.state === "unknown",
    snapshotAgeState: verdict.state,
    snapshotAnchor: snapshot.builtAtSource,
  }
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
    // Which clock the age came from. A deployment has a build stamp; a local
    // process falls back to the file's mtime, which can lie about a warm-workspace
    // copy — so the header says which one this answer is based on.
    if (result.snapshotAnchor) headers["X-Blog-Snapshot-Anchor"] = result.snapshotAnchor
    // The 24–48 h band is still served, and this is how anything watching the
    // deployment sees the approach to the 48 h refusal instead of discovering it
    // when the blog starts answering 503.
    if (result.snapshotAgeState === "stale") headers["X-Blog-Snapshot-Stale"] = "1"
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
