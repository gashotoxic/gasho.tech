export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  content: string
  author: string
  category: string
  date: string
  image: string
  published: boolean
}

import blogsData from "@/data/blogs.json"

export const blogPosts: BlogPost[] = blogsData.posts || []
