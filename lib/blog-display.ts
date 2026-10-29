/**
 * The fallbacks every blog renderer needs — one definition, both call sites.
 *
 * An edit form can legitimately store a cleared field: `image: ""`, `excerpt: ""`,
 * `author: ""`. Each renderer needs to fall back, and they used to disagree about
 * it, which is how the site ended up with an og:image pointing at the homepage
 * (`https://gashotech.com`) while the rendered `<Image>` used the house hero, and
 * an index card that rendered a cleared excerpt as a blank line.
 *
 * These are pure functions over a loose post shape so the pages, the feed and the
 * tests all use the same rule.
 */

/** The hero every post falls back to. */
export const BLOG_HERO_FALLBACK = "/images/AI.webp"

/** The site's own byline, for a post whose author was cleared. */
export const BLOG_AUTHOR_FALLBACK = "GashoTech Team"

/** The origin every absolute blog URL is built from. */
export const BLOG_ORIGIN = "https://gashotech.com"

/** Longest derived excerpt, in characters. */
const EXCERPT_LENGTH = 160

interface DisplayablePost {
  title?: unknown
  excerpt?: unknown
  author?: unknown
  image?: unknown
  content?: unknown
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/** The hero path to render, falling back to the house image. */
export function heroPath(post: DisplayablePost): string {
  return text(post.image) || BLOG_HERO_FALLBACK
}

/**
 * The absolute hero URL for metadata and structured data.
 *
 * Built from `heroPath`, so a cleared hero cannot become `https://gashotech.com`
 * — a share card pointing at the homepage, and structured data claiming the site
 * root is the article's image.
 */
export function heroUrl(post: DisplayablePost): string {
  return `${BLOG_ORIGIN}${heroPath(post)}`
}

/**
 * A description for metadata and cards: the excerpt, or the title when the
 * excerpt was cleared. An empty share-card description is worse than the title
 * that sits above it.
 */
export function descriptionFor(post: DisplayablePost): string {
  return text(post.excerpt) || text(post.title)
}

/**
 * A byline: the stored author, or the house byline. `authors: [""]` in OpenGraph
 * metadata is a claim that nobody wrote it.
 */
export function authorFor(post: DisplayablePost): string {
  return text(post.author) || BLOG_AUTHOR_FALLBACK
}

/**
 * An excerpt for the index card: the stored excerpt, else the first sentence-ish
 * of the body, else the title.
 *
 * The card reserved a line for it, so a cleared excerpt rendered as a blank gap
 * under the heading. Deriving one from the body costs nothing and says more than
 * an empty line; markdown markers are stripped because the card renders text, not
 * HTML.
 */
export function excerptFor(post: DisplayablePost): string {
  const excerpt = text(post.excerpt)
  if (excerpt) return excerpt

  const body = text(post.content)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!body) return text(post.title)

  if (body.length <= EXCERPT_LENGTH) return body
  const cut = body.slice(0, EXCERPT_LENGTH)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
