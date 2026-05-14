# GashoTech Website — Modernization Plan

**Repo:** github.com/gashotoxic/gasho.tech
**Live domain:** gashotech.com (Vercel)
**Date:** 2026-05-14

---

## Current State (Before)

| Item | Detail |
|------|--------|
| Stack | Static HTML + Bootstrap 3.3.6 + jQuery 1.12 + FA 4.7 |
| Pages | 1 monolithic index.html (1255 lines) + 6 solution pages + profile |
| JS files | 7 separate files (chat-widget, theme-toggle, mouse-trail, jquery, bootstrap) |
| CSS | 1 custom stylesheet (819 lines) + 2 inline style blocks in index.html |
| Images | 12 WebP images, 1.2MB total |
| Chat widget | Frontend-only rule-based chatbot (no backend API) |
| Contact form | No backend — commented-out alert in jquery.js |
| Subscribe form | No backend — does nothing on submission |
| Sitemap | Was pointing to dead domain (gasho.tech) — **fixed** |
| SEO subpages | No meta descriptions, no OG tags, no canonical URLs |
| CNAME | Still says `gasho.tech` |
| Blog | 3 hardcoded links, "SEE MORE" button disabled |
| main.txt | Duplicate backup of index.html (can remove) |

---

## Target Stack

| Layer | Technology | Why |
|-------|------------|-----|
| Framework | **Next.js 15** (App Router) | Vercel-native, SSG, ISR, Metadata API |
| Styling | **Tailwind CSS v4** | Purged output ~10KB vs Bootstrap 120KB |
| Animations | **Framer Motion** | Scroll fade-ins, hover effects, carousel |
| Icons | **Lucide React / Heroicons** | Tree-shakeable SVG, replaces FA 4.7 |
| Blog | **MDX + next-mdx-remote** | Write posts in markdown, render as React |
| Contact/Subscribe | **Resend** (email API) + API route | Serverless, free tier, Vercel-native |
| Chat widget | **Custom — connects to GT-ASSIST-V2 API** | Showcases own product |
| Sitemap | **next-sitemap** | Dynamic, auto-discovers blog posts |
| RSS | **feed** npm package | Auto-generated from blog posts |
| OG images | **@vercel/og** (satori) | Dynamic per-page OG images |
| 404 | Custom `not-found.tsx` | Graceful branded page |

---

## Migration Rules

1. **Visual fidelity is sacred.** Every component must be a pixel match before it replaces the old one.
2. **No regression.** The old site stays live until the new site is 100% verified.
3. **Progressive swap.** Sections are rebuilt one-by-one, not a big-bang rewrite.
4. **All current functionality preserved.** Dark mode, cosmic canvas, mouse trail, scroll animations — all ported.
5. **Blog pipeline from VICTOR+SCOUT.** Blog content directory is the source of truth; CI handles deploy.

---

## Sprint 0: Infrastructure Setup (Day 1)

```
[ ] Create Next.js project
    npx create-next-app@latest gasho.tech --typescript --tailwind --app --src-dir

[ ] Configure Tailwind with GashoTech theme
    - Primary:   #1abc9c
    - Primary-dark: #16a085
    - Text:      #303030 / #818181
    - Dark bg:   #1a1a1a / #2d2d2d
    - Fonts:     Lato (body), Montserrat (headings) — Google Fonts

[ ] Copy images from old site → public/images/

[ ] Update CNAME file → gashotech.com

[ ] Create vercel.json
    - Rewrites (optional)
    - Headers (security, CORS)
    - ISR configuration

[ ] Set up git branch structure
    - main (production) — Vercel auto-deploy
    - develop (staging) — preview deploys
    - feature/* (per sprint)

[ ] First deploy to Vercel preview
    - Verify build succeeds
    - Verify custom domain mapping

[ ] Remove main.txt from repo (old backup)
```

---

## Sprint 1: Layout Shell & Navigation (Day 2-3)

```
[ ] Root layout (app/layout.tsx)
    - HTML lang="en"
    - Google Analytics (gtag) — ported from existing
    - Meta Pixel — ported from existing
    - Schema.org Organization JSON-LD — ported + expanded
    - Viewport meta
    - Font loading (Lato + Montserrat via next/font)

[ ] Navbar component
    - Sticky top, Bootstrap look recreated in Tailwind
    - Logo → links to /
    - Nav items: ABOUT, SERVICES, SOLUTIONS, TESTIMONIALS, BLOGS, CONTACT
    - "MORE" dropdown: Stories, Resources, Tools
    - Mobile hamburger menu
    - Smooth scroll to sections (CSS scroll-behavior or Framer Motion)
    - Dark mode awareness

[ ] Footer component
    - © 2025 GashoTech
    - Links: Terms of Service, Privacy Policy, Contact Us
    - Social icons: Facebook, Twitter/X, LinkedIn, Instagram, YouTube
    - Back-to-top button
    - Dark mode toggle button (position fixed, top-right)

[ ] Theme Toggle component
    - Port from existing theme-toggle.js logic:
      1. Manual selection (localStorage)
      2. System preference (prefers-color-scheme)
      3. Time-based fallback (6PM–6AM = dark)
    - Use Tailwind dark: variant with class strategy
    - Theme toggle persists across pages and page reloads

[ ] 404 page (app/not-found.tsx)
    - Branded GashoTech 404
    - Link back to homepage
    - Contact CTA
```

---

## Sprint 2: Homepage Sections (Day 4-6)

```
[ ] Hero / Jumbotron section
    - Cosmic canvas animation → Canvas API in a React component
    - H1: "GashoTech | Innovating AI,Automation and Cybersecurity Solutions"
    - Subtitle: "THE BEST EXPERIENCE WITH ICT"
    - Social icons row
    - Email subscribe input + button (connects to API route)
    - Background: teal (#1abc9c) same as current

[ ] About section
    - Copy exactly from current index.html
    - "Empowering the Future with AI and Innovation"
    - Why Choose Us? list: Expertise, Tailored, Security-First, Customer-Centric
    - About Us image + logo image
    - "Get in Touch" CTA button

[ ] Values section (Mission & Vision)
    - Mission statement
    - Vision statement
    - Same layout, same styling

[ ] Services grid (6 cards)
    - AI Solutions
    - AI Automation
    - Cybersecurity
    - ICT Services
    - Network & Data
    - Computer Services
    - Each: icon, title, description, "LEARN MORE" link → solution page
    - Grid: 3 columns desktop, 2 tablet, 1 mobile
    - Hover effects preserved: translateY, shadow, icon scale

[ ] Solutions grid (6 cards with images)
    - Same 6 services, but with hero images and card layout
    - Image, overlay, title, description, "LEARN MORE" button
    - Hover: image zoom, overlay fade-in, title underline grow
    - Links to corresponding /solutions/* page

[ ] Testimonials carousel
    - 3 testimonial slides
    - Previous/Next buttons
    - Slide indicators (dots)
    - Auto-rotate every 5 seconds

[ ] Blog preview section (hardcoded for now)
    - "SECURITY AND SAFETY" — top 3 blog post links
    - "SEE MORE" button (will be enabled when blog is live)
    - Portfolio section placeholder
    - Resources section placeholder

[ ] Contact section
    - Form fields: Name, Email, Message
    - Submit → API route → Resend email
    - Phone, email, location (Nairobi, Kenya)

[ ] Fade-in scroll animations
    - Port from current JS IntersectionObserver + fade-in class
    - Replace with Framer Motion `whileInView`
```

---

## Sprint 3: Solution Pages & Subpages (Day 7-8)

```
[ ] Route structure:
    /solutions/ai
    /solutions/automation
    /solutions/cybersecurity
    /solutions/ict
    /solutions/computer
    /solutions/network-and-data

[ ] Each solution page:
    - Hero image (same image served via next/image)
    - Overview section
    - Benefits
    - Key Features
    - Use Cases
    - Contact CTA
    - Content ported from existing solutions_*.html

[ ] Solution layout component (shared)
    - Navbar (reuse)
    - Footer (reuse)
    - Breadcrumb
    - Structured data: Service schema
    - Per-page metadata: title, description, OG, canonical

[ ] Profile page (app/profile/)
    - Port from MyProfile/profile.html
    - Kept as-is or lightly refreshed

[ ] Terms & Privacy pages
    - app/terms/
    - app/privacy/
    - Content ported from existing HTML files
```

---

## Sprint 4: Blog Engine (Day 9-10)

```
[ ] MDX content pipeline setup
    - Install: next-mdx-remote, rehype-highlight, remark-gfm
    - content/blog/ — directory for MDX files
    - Each post has frontmatter: title, date, author, tags, image, description

[ ] Blog index page (app/blog/page.tsx)
    - List all posts, newest first
    - Card layout: image, title, date, excerpt, tags
    - Pagination (10 posts per page)
    - RSS feed link

[ ] Blog post page (app/blog/[slug]/page.tsx)
    - Render MDX content
    - Article schema.org structured data
    - OG image (auto-generated with @vercel/og)
    - Share buttons
    - Related posts
    - Author bio

[ ] Category/tag filtering
    - Filter by tag on /blog/tag/[tag]
    - Filter by category

[ ] RSS feed (app/feed.xml/route.ts)
    - Auto-generated from all blog posts
    - Full content RSS

[ ] Daily blog pipeline (VICTOR + SCOUT integration)
    - VICTOR produces MDX file
    - Script commit-to-repo and push
    - Vercel auto-deploys via ISR
    - OR: webhook endpoint that accepts posts

[ ] Blog schema
    - Article structured data per post
    - BreadcrumbList
    - BlogPosting schema

[ ] Enable "SEE MORE" button on homepage
    - Links to /blog
```

---

## Sprint 5: Chat Widget, Forms & Backend Integration (Day 11-12)

```
[ ] Chat widget → GT-ASSIST-V2 integration
    - Rebuild widget UI in React (port current HTML/CSS)
    - Replace getResponse() with real API calls to GT-ASSIST-V2 backend
    - Fallback: if GT-ASSIST-V2 is unreachable, use current rule-based responses
    - Same look and feel as current widget
    - Persist chat state in localStorage (same as current)

[ ] Contact form API route
    - POST /api/contact
    - Send email via Resend
    - Rate limiting
    - Honeypot spam prevention
    - Success/error feedback

[ ] Subscribe form API route
    - POST /api/subscribe
    - Store email (database or Resend audience)
    - Success confirmation
    - Same as current: email input in hero section

[ ] Newsletter integration
    - Store subscribers
    - (Optional) Connect to Mailchimp/ConvertKit for automated campaigns
```

---

## Sprint 6: SEO, Performance & Polish (Day 13-14)

```
[ ] Dynamic sitemap
    - next-sitemap config
    - Auto-includes: /, all solutions pages, all blog posts, profile, terms, privacy
    - Auto-updates when new blog posts are added
    - Submit to Google Search Console

[ ] Robots.txt
    - Already fixed ✅
    - Verify after migration

[ ] Per-page metadata factory
    - Every page gets: title, meta description, OG tags, Twitter card, canonical
    - Factory function in lib/metadata.ts
    - Auto-generated OG images with @vercel/og

[ ] Structured data everywhere
    - Organization (homepage) — done ✅
    - Service (each solution page)
    - Article (each blog post)
    - FAQPage (if applicable)
    - BreadcrumbList (all pages)
    - LocalBusiness (Nairobi location)

[ ] llms.txt file
    - /llms.txt route
    - Structured summary of GashoTech for AI crawlers (GPTBot, Claude, Google-Extended)
    - Contains: company info, services, key pages, FAQ

[ ] Image optimization
    - next/image for all images (lazy loading, WebP, responsive sizes)
    - Compress oversized images (software.webp is 212KB)
    - Generate multiple sizes for responsive

[ ] Performance audit
    - Lighthouse target: 90+ Performance, 95+ SEO, 90+ Accessibility
    - Bundle analysis
    - Core Web Vitals check

[ ] Vercel configuration
    - vercel.json: headers (CSP, HSTS), caching, ISR
    - Analytics (Vercel Web Analytics)
    - Speed Insights

[ ] Remove old files
    - chat-widget.js, chat-widget.css (replaced by React component)
    - jquery.js (replaced by native JS / Framer Motion)
    - mouse-trail.js (ported to React)
    - theme-toggle.js (ported to React)
    - main.txt (old backup)
    - .claude/, .roo/ (agent configs — keep or move)
```

---

## Sprint 7: Content Pipeline Automation (Day 15-16)

```
[ ] Blog ingestion script (scripts/ingest-blog.js)
    - Accepts markdown input from VICTOR
    - Creates MDX file with frontmatter
    - Commits and pushes to repo
    - Triggers Vercel deploy

[ ] Daily cron job setup
    - Run ingest script daily (or on-demand from pipeline)
    - Vercel Cron Jobs (Pro plan) or GitHub Actions

[ ] Pipeline integration
    - SCOUT researches → feeds to VICTOR
    - VICTOR writes post → feeds to ingest script
    - Ingest creates file → auto-deploys
    - Blog live on gashotech.com/blog/[slug]

[ ] Optional: Webhook endpoint for pipeline
    - POST /api/blog/publish
    - Accepts post data, writes MDX, triggers ISR revalidation
    - Returns published URL
```

---

## Files to Remove From Repo

After migration is complete:

| File | Reason |
|------|--------|
| chat-widget.js | Replaced by React component → GT-ASSIST-V2 |
| chat-widget.css | Replaced by Tailwind |
| jquery.js | Not needed (no jQuery in Next.js) |
| mouse-trail.js | Ported to React hook |
| theme-toggle.js | Ported to React component |
| main.txt | Old backup of index.html |
| styles.css | Content merged into Tailwind config |
| .claude/ | Old agent config (keep if still used) |
| .roo/ | Old agent config (keep if still used) |
| CNAME | Old Vercel domain pointer |

---

## Deployment Strategy

```
1. New site builds in /tmp/gasho.tech-migrated/ (separate from old repo)
2. Old site stays live at gashotech.com throughout
3. New site deployed to Vercel preview URL for verification
4. After full verification, Vercel production domain switched to new deploy
5. Old repo archived or replaced with new codebase

Alternative: Rebuild within the same repo on a new branch
1. Create 'nextjs-migration' branch from main
2. Delete everything except images/ and MyProfile/
3. Scaffold Next.js project
4. Build all components
5. Merge to main when complete
```

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Cosmic canvas breaks in React | Low | Isolate in a separate Canvas component, pure JS |
| Dark mode flash on load | Medium | Inline critical theme script in <head> |
| Blog pipeline fails silently | Low | Add health checks, email alerts |
| GT-ASSIST-V2 API not ready | Medium | Fallback to rule-based responses |
| Image CDN issues | Low | next/image handles fallback formats |
| SEO dip during migration | Low | Keep old site live, redirect after verification |
| VICTOR output format changes | Medium | Schema validation on ingest script |

---

## Success Criteria

```
[ ] Site looks identical to old site (pixel match verified)
[ ] All anchor links work (scroll to sections)
[ ] Dark mode works on all pages
[ ] All 6 solution pages have content and metadata
[ ] Blog renders posts from MDX files
[ ] Blog RSS feed works
[ ] Contact form sends email
[ ] Subscribe form stores email
[ ] Chat widget connects to GT-ASSIST-V2
[ ] OG tags render correctly on all pages
[ ] Sitemap includes all pages + blog posts
[ ] Lighthouse: Performance ≥90, SEO ≥95, Accessibility ≥90
[ ] Vercel deploy succeeds with zero errors
[ ] No 404s (old 404 page replaced with branded one)
[ ] CNAME updated to gashotech.com
[ ] llms.txt accessible and accurate
[ ] Daily blog pipeline operational
```
