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

const MAX_SLUG_LENGTH = 120

/** Slugs feed routing, so normalise and bound them instead of trusting the body. */
export function normalizeSlug(input: unknown, fallback: string): string | null {
  const raw = typeof input === "string" && input.trim() ? input : fallback
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  if (!slug || slug.length > MAX_SLUG_LENGTH) return null
  return slug
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback
}

function asTags(value: unknown, fallback: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) return fallback
  const tags = value.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim())
  return tags.filter((tag) => tag.length > 0)
}

function asReadTime(value: unknown, fallback: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * Build the stored post for an update: caller-editable fields are taken from
 * the body when valid, everything else is carried over untouched. The slug and
 * the publish date are never rewritten by an edit, and unknown keys are dropped
 * rather than merged in.
 */
export function applyPostUpdate(existing: BlogPostShape, update: unknown): BlogPostShape {
  const body = (update ?? {}) as Record<string, unknown>

  return {
    slug: existing.slug,
    title: asString(body.title, existing.title),
    excerpt: asString(body.excerpt, existing.excerpt),
    content: asString(body.content, existing.content),
    author: asString(body.author, existing.author),
    category: asString(body.category, existing.category),
    date: existing.date,
    image: asString(body.image, existing.image),
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
  const fallbackExcerpt = asString(archived?.excerpt, input.title)
  const fallbackDate = asString(archived?.date, new Date().toISOString().split("T")[0])

  return {
    slug,
    title: input.title,
    excerpt: asString(input.excerpt, fallbackExcerpt),
    content: input.content,
    author: asString(input.author, archived ? asString(archived.author, "GashoTech Team") : "GashoTech Team"),
    category: asString(
      input.category,
      archived ? asString(archived.category, "Technology") : "Technology"
    ),
    // A re-publish keeps the archived publish date.
    date: fallbackDate,
    image: asString(input.image, archived ? asString(archived.image, "/images/AI.webp") : "/images/AI.webp"),
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
