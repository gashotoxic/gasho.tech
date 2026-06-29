# DOX -- app/blogs/

**Blog post dynamic routes**

Renders blog posts from `data/blogs.json` via Next.js dynamic routes. Each post is statically generated from the JSON source.

## Local Contracts

- Source of truth: `data/blogs.json` (DO NOT duplicate here)
- Slugs must be URL-safe, lowercase, hyphenated
- Image dimensions: 1200x630 WebP (OG-compatible)
- Each post page must expose OpenGraph metadata
