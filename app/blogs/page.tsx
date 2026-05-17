import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { Calendar, Tag } from "lucide-react"
import { blogPosts } from "@/lib/blogs"
import type { BlogPost } from "@/lib/blogs"

export const metadata: Metadata = {
  title: "Blog",
  description: "GashoTech Blog - AI, Automation, Cybersecurity insights and news",
}

export default function BlogsPage() {
  const posts = blogPosts.filter((p: BlogPost) => p.published)

  return (
    <div className="pt-20 pb-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Our Blog</h1>
          <p className="text-lg text-foreground/70 dark:text-[#cccccc] max-w-2xl mx-auto">
            Insights, news, and updates on AI, automation, cybersecurity, and technology
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-lg text-muted-foreground">No blog posts yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post: BlogPost) => (
              <Link key={post.slug} href={`/blogs/${post.slug}`} className="group block">
                <article className="bg-card rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 h-full flex flex-col">
                  <div className="relative h-48 overflow-hidden">
                    <Image
                      src={post.image || "/images/AI.webp"}
                      alt={post.title}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-2 text-xs text-[#1abc9c] mb-3">
                      <Tag className="h-3 w-3" />
                      <span>{post.category}</span>
                    </div>
                    <h2 className="text-lg font-bold mb-2 text-foreground group-hover:text-[#1abc9c] transition-colors duration-300">
                      {post.title}
                    </h2>
                    <p className="text-sm text-foreground/70 dark:text-[#cccccc] mb-4 flex-1">
                      {post.excerpt}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-4 border-t border-border">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(post.date).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="flex items-center gap-1">
                        <span>{post.author}</span>
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
