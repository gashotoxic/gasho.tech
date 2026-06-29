# DOX -- app/

**Next.js App Router root — routes, layouts, and server components**

## Purpose

Root of the Next.js App Router. Contains route segments, server components, layouts, API routes, and global metadata (sitemap, robots, RSS feed).

## Ownership

- `api/` — Route handlers (REST endpoints)
- `blogs/` — Blog post dynamic routes (renders entries from `data/blogs.json`)
- `feed.xml/` — RSS feed route
- `llms.txt/` — `/llms.txt` route (LLM discovery file)
- `privacy/` — Privacy policy page
- `profile/` — Founder profile page
- `services/` — Services showcase pages
- `terms/` — Terms of service page

## Local Contracts

- All pages are Server Components by default; mark with `"use client"` only when needed
- Use `next/image` for all images, never raw `<img>` tags
- Sitemap and robots routes are dynamically generated from `data/`
- Page-level metadata goes via `metadata` export, not `<head>`
- Site deployment: Vercel. Git author must be `gashotoxic <denismugo101@gmail.com>` or Vercel deploys will fail.

## Child DOX Index

- [blogs/](./blogs/AGENTS.md) — Blog post dynamic routing
- [feed.xml/](./feed.xml/AGENTS.md) — RSS feed
