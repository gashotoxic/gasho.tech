/**
 * Field-level sanitising for admin blog writes.
 *
 * Pure (no framework imports) so it can be unit-tested: the route decides
 * *whether* a caller may write, this decides *what* they may write.
 */

export interface BlogPostShape {
  slug: string
  title: string
  excerpt: string
  content: string
  author: string
  category: string
  date: string
  image: string
  published: boolean
  tags?: string[]
  readTime?: number
}

export const MAX_SLUG_LENGTH = 120

/** The committed file has a hard ceiling at GitHub (1 MB), so a post's metadata
 * must not be able to grow without limit. The archive's widest post carries 8
 * tags; 10 x 32 characters leaves headroom and still refuses runaway input. */
const MAX_TAGS = 10
const MAX_TAG_LENGTH = 32

/** The hero image every post gets when it names none. */
export const HOUSE_IMAGE_PATH = "/images/AI.webp"

/**
 * Slugify a title. Exported on its own so a caller can tell *why* a slug was
 * refused: `normalizeSlug` returns `null` both for an empty result and for one
 * over the length bound, which is not enough to write a useful 400 message.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

/** Slugs feed routing, so normalise and bound them instead of trusting the body. */
export function normalizeSlug(input: unknown, fallback: string): string | null {
  const raw = typeof input === "string" && input.trim() ? input : fallback
  const slug = slugify(raw)
  if (!slug || slug.length > MAX_SLUG_LENGTH) return null
  return slug
}

/**
 * A title as it is compared against the archive: case and whitespace collapsed.
 *
 * The archive is hand-maintained and titles differ by spacing and capitalisation
 * between the studio's output and what was committed, so an exact string compare
 * finds nothing.
 */
export function normalizeTitle(title: unknown): string {
  return typeof title === "string" ? title.trim().replace(/\s+/g, " ").toLowerCase() : ""
}

/**
 * Every archived post whose title normalises to `title` — all of them, never the
 * first one.
 *
 * `data/blogs.json` really does hold a duplicate-title pair (two different posts,
 * two different slugs, the same title) from the old append bug, so a title alone
 * cannot always identify one post. A caller that picks the first match rewrites
 * one post's body with another's content and leaves the second URL serving stale
 * text — a silent destruction where the old behaviour appended a harmless
 * duplicate. Callers must therefore treat `length > 1` as "I cannot tell which
 * post this means" and refuse, or name the slug explicitly.
 */
export function findPostsByTitle<T extends { title?: unknown }>(
  posts: readonly T[],
  title: unknown
): T[] {
  const wanted = normalizeTitle(title)
  if (!wanted) return []
  return posts.filter((post) => normalizeTitle(post.title) === wanted)
}

/**
 * A post title as it may appear inside a commit message.
 *
 * Commit messages are line-oriented, and the title is caller-supplied: a title
 * containing a newline forges extra lines in the history of `main` — trailers
 * included (`Co-authored-by:`, `Signed-off-by:`). The post keeps its title as
 * written; only the copy that reaches the commit log is flattened and bounded.
 */
export function commitTitle(title: unknown): string {
  const text = typeof title === "string" ? title : String(title ?? "")
  return text
    .replace(/[\r\n\t\u0000-\u001f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 120)
}

/**
 * True when the caller actually named this key.
 *
 * An absent key and an explicit `undefined` both mean "I did not send this", so a
 * caller that always builds the key (`image: imagePath`, with `imagePath` itself
 * undefined) still gets the stored value back. Without this distinction a client
 * could never *clear* a field either: '' and "not sent" were the same thing.
 */
function isProvided(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined
}

/**
 * Required strings (`title`, `content`): a blank or wrongly-typed value keeps the
 * stored one. These fields may not be emptied — a post with no title or no body
 * is not a post.
 */
function asRequiredString(body: Record<string, unknown>, key: string, fallback: string): string {
  const value = body[key]
  return typeof value === "string" && value.trim() ? value : fallback
}

/**
 * Optional strings (`excerpt`, `author`, `category`, `image`): key absent means
 * "keep what is stored", an explicit `''` means "clear it".
 *
 * The previous truthiness check could not tell those two apart, so `''` silently
 * fell back to the archived value and the studio had no way to remove an excerpt
 * or a hero image at all.
 */
function asClearableString(body: Record<string, unknown>, key: string, fallback: string): string {
  if (!isProvided(body, key)) return fallback
  const value = body[key]
  // Trimmed for the same reason the title is: a stray leading space is invisible
  // on the page but makes the same value look like a different one to every
  // comparison, and `"   "` means the caller emptied the field.
  return typeof value === "string" ? value.trim() : fallback
}

/** Read a value that is already stored: blank or wrongly-typed falls back. */
function nonBlank(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback
}

/**
 * The stored hero image is a path this site serves, never a URL to somewhere
 * else: `next/image` renders it and `og:image` is built as
 * `https://gashotech.com${image}`. `javascript:`, `https://evil…` and the
 * protocol-relative `//evil…` would break the page and produce a nonsense share
 * card, so anything that is not a rooted `/images/` path — or that tries to
 * traverse with `..` — falls back to the stored value.
 *
 * A constrained query string is allowed because five archived posts carry
 * cache-busting heroes (`/images/blog/x.webp?v=3`) and `next/image` is
 * configured to serve that pattern (`localPatterns` in `next.config.ts`).
 * Anything else in the query — another `?`, a `#`, an unescaped character — is
 * refused: the value also reaches `<img src>` through `next/image`.
 */
const SAFE_IMAGE_PATH = /^\/images\/(?!.*\.\.)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*(?:\?[A-Za-z0-9._=-]*)?$/

function asTags(value: unknown, fallback: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) return fallback
  const tags = value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && tag.length <= MAX_TAG_LENGTH)
  return tags.slice(0, MAX_TAGS)
}

/**
 * A hero image the caller named: `''` clears it (as for the other optional
 * strings), a usable `/images/` path is stored, and anything else keeps what is
 * stored rather than putting a broken URL on the page.
 */
function asImagePath(body: Record<string, unknown>, key: string, fallback: string): string {
  if (!isProvided(body, key)) return fallback
  const value = body[key]
  if (typeof value !== "string") return fallback
  if (value === "") return ""
  return SAFE_IMAGE_PATH.test(value) ? value : fallback
}

function asReadTime(value: unknown, fallback: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * Build the stored post for an update: caller-editable fields are taken from
 * the body when provided, everything else is carried over untouched. The slug and
 * the publish date are never rewritten by an edit, and unknown keys are dropped
 * rather than merged in.
 *
 * `title` and `content` are required, so a blank one keeps the stored value; the
 * optional strings are clearable with an explicit `''`.
 */
export function applyPostUpdate(existing: BlogPostShape, update: unknown): BlogPostShape {
  const body = (update ?? {}) as Record<string, unknown>

  return {
    slug: existing.slug,
    title: asRequiredString(body, "title", existing.title).trim(),
    excerpt: asClearableString(body, "excerpt", existing.excerpt),
    content: asRequiredString(body, "content", existing.content),
    author: asClearableString(body, "author", existing.author),
    category: asClearableString(body, "category", existing.category),
    date: existing.date,
    image: asImagePath(body, "image", existing.image),
    published:
      typeof body.published === "boolean" ? body.published : existing.published,
    tags: asTags(body.tags, existing.tags),
    readTime: asReadTime(body.readTime, existing.readTime),
  }
}

/**
 * Build the stored post for a create: same whitelist, no carried-over fields.
 *
 * `existing` is the post already archived under this slug, when there is one.
 * The studio has no separate update form — re-publishing a title IS the edit
 * path — so without it every field the caller did not send fell back to a
 * create-time default. That silently reset the hero image to `/images/AI.webp`,
 * replaced a hand-written excerpt with the title, and stamped today's date on a
 * months-old post, which (the index sorts date-desc) moved it back to the top.
 * With `existing`, the archived value is the fallback and only an explicitly
 * provided field overwrites it.
 *
 * Clearing: `{ image: '' }` stores an empty hero (the caller asked for it) while
 * leaving the key out preserves the archived one.
 */
export function buildNewPost(
  body: unknown,
  slug: string,
  existing?: BlogPostShape | null
): BlogPostShape | null {
  if (!body || typeof body !== "object") return null
  const input = body as Record<string, unknown>
  if (typeof input.title !== "string" || !input.title.trim()) return null
  if (typeof input.content !== "string" || !input.content.trim()) return null

  const archived = existing ?? undefined
  // Store the title trimmed: it is compared against the archive when a client
  // sends no slug, and a stray leading space used to make the same post look
  // like a different one.
  const title = input.title.trim()
  const fallbackExcerpt = nonBlank(archived?.excerpt, title)
  const fallbackDate = nonBlank(archived?.date, new Date().toISOString().split("T")[0])

  return {
    slug,
    title,
    excerpt: asClearableString(input, "excerpt", fallbackExcerpt),
    content: input.content,
    author: asClearableString(input, "author", nonBlank(archived?.author, "GashoTech Team")),
    category: asClearableString(input, "category", nonBlank(archived?.category, "Technology")),
    // A re-publish keeps the archived publish date.
    date: fallbackDate,
    image: asImagePath(input, "image", nonBlank(archived?.image, HOUSE_IMAGE_PATH)),
    published:
      typeof input.published === "boolean"
        ? input.published
        : typeof archived?.published === "boolean"
          ? archived.published
          : true,
    tags: asTags(input.tags, archived?.tags),
    readTime: asReadTime(input.readTime, archived?.readTime),
  }
}
