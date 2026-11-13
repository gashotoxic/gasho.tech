# DOX -- components/sections/

**Page sections**

Large composable blocks used inside routes: Hero, ServicesGrid, TestimonialsCarousel, ContactCTA.

## Local Contracts

- Server components by default (they are rendered from route server components). Add `"use client"` only for genuine browser state, and keep any data import server-side: `blogs.tsx` reads the blog archive through `lib/blogs-data.ts`, which must never end up in a client graph (`test/blogs-client-bundle.test.ts` enforces it).
