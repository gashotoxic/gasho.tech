"use client"

import { FadeIn } from "@/components/effects/fade-in";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { blogPosts } from "@/lib/blogs";
import { Calendar, Tag, ChevronRight } from "lucide-react";

export default function Blogs() {
  const posts = blogPosts.filter((p) => p.published).slice(0, 3);

  return (
    <section className="bg-grey section-padding">
      <div className="container mx-auto px-4">
        <FadeIn>
          <h2 className="text-center text-3xl font-bold mb-4">Our Blog</h2>
          <h4 className="text-center text-lg text-foreground/70 dark:text-[#cccccc] mb-12 max-w-2xl mx-auto">
            Insights, news, and updates on AI, automation, cybersecurity, and technology
          </h4>
        </FadeIn>

        {posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No blog posts yet.</p>
            <Link
              href="/blogs"
              className="inline-block mt-4 text-[#1abc9c] hover:text-[#16a085] font-semibold transition-colors"
            >
              Visit our Blog
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {posts.map((post, index) => (
              <FadeIn key={post.slug} delay={index * 0.1}>
                <Link href={`/blogs/${post.slug}`} className="group block">
                  <Card className="overflow-hidden border-none shadow-lg bg-white dark:bg-card hover-glow">
                    <div className="relative w-full h-48 overflow-hidden">
                      <Image
                        src={post.image || "/images/gashotech_logo.webp"}
                        alt={post.title}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute top-3 left-3 bg-[#1abc9c] text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                        {post.category}
                      </div>
                    </div>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(post.date).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <h4 className="text-lg font-bold mb-2 text-foreground group-hover:text-[#1abc9c] transition-colors duration-300">
                        {post.title}
                      </h4>
                      <p className="text-sm text-foreground/70 dark:text-[#cccccc] line-clamp-3">
                        {post.excerpt}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </FadeIn>
            ))}
          </div>
        )}

        <FadeIn delay={0.3}>
          <div className="text-center mt-10">
            <Link
              href="/blogs"
              className="inline-flex items-center gap-2 bg-[#1abc9c] hover:bg-[#16a085] text-white font-semibold px-8 py-3 rounded-full transition-all hover:shadow-lg hover:scale-105"
            >
              View All Posts
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
