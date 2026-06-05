import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import type { BlogPost } from "@/lib/blogs"
import { renderMarkdown } from "@/lib/studio-api"
import { Calendar, Tag, ArrowLeft } from "lucide-react"

interface Props {
  params: Promise<{ slug: string }>
}

export const dynamic = "force-dynamic"
export const revalidate = 0

async function getPost(slug: string): Promise<BlogPost | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://gashotech.com"
    const res = await fetch(`${baseUrl}/api/blogs`, { cache: "no-store" })
    if (res.ok) {
      const posts: BlogPost[] = await res.json()
      return posts.find((p) => p.slug === slug && p.published) || null
    }
  } catch (e) {
    console.error("Failed to fetch blog post:", e)
  }
  return null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return { title: "Post Not Found" }
  return {
    title: post.title,
    description: post.excerpt,
    alternates: {
      canonical: `https://gashotech.com/blogs/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: new Date(post.date).toISOString(),
      authors: [post.author],
      images: [{ url: `https://gashotech.com${post.image}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [{ url: `https://gashotech.com${post.image}` }],
    },
  }
}

function formatContent(content: string): string {
  return renderMarkdown(content)
    .replace(/<h1>/g, '<h1 class="text-3xl font-bold mt-8 mb-4">')
    .replace(/<h2>/g, '<h2 class="text-2xl font-bold mt-8 mb-4">')
    .replace(/<h3>/g, '<h3 class="text-xl font-bold mt-6 mb-3">')
    .replace(/<p class=/g, '<p class="text-foreground/80 dark:text-[#cccccc] leading-relaxed mb-2" class=')
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)

  if (!post) {
    notFound()
  }

  return (
    <div className="pt-20 pb-12">
      {/* Article Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.excerpt,
            image: `https://gashotech.com${post.image}`,
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
            src={post.image || "/images/AI.webp"}
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
