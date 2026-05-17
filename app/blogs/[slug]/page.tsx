import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { blogPosts } from "@/lib/blogs"
import type { BlogPost } from "@/lib/blogs"
import { Calendar, Tag, ArrowLeft } from "lucide-react"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = blogPosts.find((p: BlogPost) => p.slug === slug)
  if (!post) return { title: "Post Not Found" }
  return {
    title: post.title,
    description: post.excerpt,
  }
}

export async function generateStaticParams() {
  return blogPosts.filter((p: BlogPost) => p.published).map((post: BlogPost) => ({ slug: post.slug }))
}

function formatContent(content: string): string {
  return content
    .split("\n")
    .map((line) => {
      if (line.startsWith("### ")) return `<h3 class="text-xl font-bold mt-6 mb-3 text-foreground">${line.slice(4)}</h3>`
      if (line.startsWith("## ")) return `<h2 class="text-2xl font-bold mt-8 mb-4 text-foreground">${line.slice(3)}</h2>`
      if (line.startsWith("#### ")) return `<h4 class="text-lg font-semibold mt-4 mb-2 text-foreground">${line.slice(5)}</h4>`
      if (line.startsWith("- ")) return `<li class="ml-4 text-foreground/80 dark:text-[#cccccc]">${line.slice(2)}</li>`
      if (line.startsWith("1. ")) return `<li class="ml-4 list-decimal text-foreground/80 dark:text-[#cccccc]">${line.slice(3)}</li>`
      if (line.trim() === "") return "<br>"
      return `<p class="text-foreground/80 dark:text-[#cccccc] leading-relaxed mb-2">${line}</p>`
    })
    .join("\n")
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = blogPosts.find((p: BlogPost) => p.slug === slug)

  if (!post || !post.published) {
    notFound()
  }

  return (
    <div className="pt-20 pb-12">
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
