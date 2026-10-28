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

/** Build the stored post for a create: same whitelist, no carried-over fields. */
export function buildNewPost(body: unknown, slug: string): BlogPostShape | null {
  if (!body || typeof body !== "object") return null
  const input = body as Record<string, unknown>
  if (typeof input.title !== "string" || !input.title.trim()) return null
  if (typeof input.content !== "string" || !input.content.trim()) return null

  return {
    slug,
    title: input.title,
    excerpt: asString(input.excerpt, input.title),
    content: input.content,
    author: asString(input.author, "GashoTech Team"),
    category: asString(input.category, "Technology"),
    date: new Date().toISOString().split("T")[0],
    image: asString(input.image, "/images/AI.webp"),
    published: typeof input.published === "boolean" ? input.published : true,
    tags: asTags(input.tags, undefined),
    readTime: asReadTime(input.readTime, undefined),
  }
}
