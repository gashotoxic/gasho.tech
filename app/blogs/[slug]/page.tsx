import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import type { BlogPost } from "@/lib/blogs"
import { renderMarkdown } from "@/lib/studio-api"
import { safeJsonLd } from "@/lib/escape"
import { BlogUnavailable } from "@/components/blogs/blog-unavailable"
import { Calendar, Tag, ArrowLeft } from "lucide-react"

interface Props {
  params: Promise<{ slug: string }>
}

export const dynamic = "force-dynamic"
export const revalidate = 0

/** The hero every post falls back to, exactly as the renderers do. */
const HERO_FALLBACK = "/images/AI.webp"

/**
 * Look one post up in the live archive.
 *
 * Three outcomes, and the difference matters: `unavailable` is an outage (the route
 * answered 503 / the fetch failed), `not-found` is a genuinely unknown slug, and
 * collapsing them into `null` turned every post URL into a 404 the moment the
 * archive could not be read.
 */
type PostLookup =
  | { status: "ok"; post: BlogPost }
  | { status: "not-found" }
  | { status: "unavailable" }

async function getPost(slug: string): Promise<PostLookup> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://gashotech.com"
    const res = await fetch(`${baseUrl}/api/blogs`, { cache: "no-store" })
    if (!res.ok) {
      console.error(`Blog archive unavailable: ${res.status} ${res.statusText}`)
      return { status: "unavailable" }
    }
    const posts: BlogPost[] = await res.json()
    if (!Array.isArray(posts)) return { status: "unavailable" }
    const post = posts.find((p) => p.slug === slug && p.published)
    return post ? { status: "ok", post } : { status: "not-found" }
  } catch (e) {
    console.error("Failed to fetch blog post:", e)
    return { status: "unavailable" }
  }
}

/**
 * A hero URL for metadata and structured data.
 *
 * A cleared hero (`image: ""`, which an edit may legitimately store) built
 * `https://gashotech.com` as the og:image, twitter:image and JSON-LD `image` — a
 * share card pointing at the homepage, and structured data claiming the site root
 * is the article's image. The rendered `<Image>` already falls back, so the
 * metadata must use the same fallback.
 */
function heroUrl(post: BlogPost): string {
  return `https://gashotech.com${post.image || HERO_FALLBACK}`
}

/**
 * A description for metadata. A cleared excerpt is storable too, and an empty
 * share-card description is worse than the title it sits under.
 */
function descriptionFor(post: BlogPost): string {
  const excerpt = typeof post.excerpt === "string" ? post.excerpt.trim() : ""
  return excerpt || post.title
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const found = await getPost(slug)

  if (found.status === "unavailable") {
    // Not "Post Not Found": the post exists, the archive did not load. Keep the
    // error page out of search results rather than teaching Google that the post
    // is gone.
    return { title: "Blog post unavailable", robots: { index: false, follow: false } }
  }
  if (found.status === "not-found") return { title: "Post Not Found" }

  const { post } = found
  const description = descriptionFor(post)

  return {
    title: post.title,
    description,
    alternates: {
      canonical: `https://gashotech.com/blogs/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description,
      type: "article",
      publishedTime: new Date(post.date).toISOString(),
      authors: [post.author],
      images: [{ url: heroUrl(post), width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      images: [{ url: heroUrl(post) }],
    },
  }
}

/**
 * JSON-LD is injected into a `<script>` element, so it goes through the shared
 * escaper in `lib/escape.ts` (`<` -> `\u003c`) — `JSON.stringify` alone leaves a
 * stored `</script>` able to close the element and turn post text into markup.
 */

function formatContent(content: string): string {
  return renderMarkdown(content)
    .replace(/<h1>/g, '<h1 class="text-3xl font-bold mt-8 mb-4">')
    .replace(/<h2>/g, '<h2 class="text-2xl font-bold mt-8 mb-4">')
    .replace(/<h3>/g, '<h3 class="text-xl font-bold mt-6 mb-3">')
    .replace(/<p class=/g, '<p class="text-foreground/80 dark:text-[#cccccc] leading-relaxed mb-2" class=')
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const found = await getPost(slug)

  if (found.status === "unavailable") {
    // An outage is not a missing post: `notFound()` here 404'd every post URL the
    // moment the archive could not be read, which is the symptom the snapshot
    // fallback exists to prevent — and the page was the one place still doing it.
    return <BlogUnavailable what="post" />
  }

  if (found.status === "not-found") {
    notFound()
  }

  const { post } = found
  const description = descriptionFor(post)

  return (
    <div className="pt-20 pb-12">
      {/* Article Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description,
            image: heroUrl(post),
            datePublished: new Date(post.date).toISOString(),
            dateModified: new Date(post.date).toISOString(),
            author: {
              "@type": "Organization",
              name: "GashoTech",
              url: "https://gashotech.com",
            },
            publisher: {
              "@type": "Organization",
              name: "GashoTech",
              logo: {
                "@type": "ImageObject",
                url: "https://gashotech.com/images/gashotech_logo.webp",
              },
            },
            mainEntityOfPage: {
              "@type": "WebPage",
              "@id": `https://gashotech.com/blogs/${post.slug}`,
            },
          }),
        }}
      />
      <article className="container mx-auto px-4 max-w-4xl">
        <Link
          href="/blogs"
          className="inline-flex items-center gap-2 text-sm text-[#1abc9c] hover:text-[#16a085] transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Blog
        </Link>

        <div className="relative w-full h-[300px] md:h-[400px] rounded-2xl overflow-hidden mb-8 shadow-xl">
          <Image
            src={post.image || HERO_FALLBACK}
            alt={post.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 100vw, 1200px"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="flex items-center gap-2 text-[#1abc9c] text-sm mb-2">
              <Tag className="h-4 w-4" />
              <span>{post.category}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white">{post.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-muted-foreground mb-8 pb-6 border-b border-border">
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {new Date(post.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
          <span className="flex items-center gap-2">
            <span>{post.author}</span>
          </span>
        </div>

        <div
          className="max-w-none"
          dangerouslySetInnerHTML={{ __html: formatContent(post.content) }}
        />

        <div className="mt-12 p-8 bg-grey rounded-2xl text-center">
          <h3 className="text-xl font-bold mb-2">Want to learn more?</h3>
          <p className="text-foreground/70 dark:text-[#cccccc] mb-4">
            Contact GashoTech for personalized consultations on AI, automation, and cybersecurity solutions.
          </p>
          <Link
            href="/#contact"
            className="inline-block bg-[#1abc9c] hover:bg-[#16a085] text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
          >
            Get in Touch
          </Link>
        </div>
      </article>
    </div>
  )
}
