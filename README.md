# GashoTech Website

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?logo=shadcnui)](https://ui.shadcn.com)

Modern, performant website for **GashoTech** — an AI, automation, and cybersecurity startup based in Kenya. Built with Next.js 16, TypeScript, Tailwind CSS v4, and shadcn/ui.

## Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 16** (App Router) | Framework — SSR, SSG, API routes |
| **TypeScript** | Type safety |
| **Tailwind CSS v4** | Utility-first styling |
| **shadcn/ui** (New York) | Accessible UI components |
| **Framer Motion** | Animations |
| **next-themes** | Dark/light mode |
| **Lucide React** | Icons |
| **Resend** | Email (contact form) |

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
gashotech-next/
├── app/                     # Next.js App Router pages
│   ├── layout.tsx           # Root layout (fonts, theme, analytics, SEO)
│   ├── page.tsx             # Homepage
│   ├── globals.css          # Global styles + brand tokens
│   ├── services/
│   │   └── [slug]/
│   │       └── page.tsx     # Service detail pages (6 routes)
│   ├── terms/page.tsx       # Terms of Service
│   ├── privacy/page.tsx     # Privacy Policy
│   ├── profile/page.tsx     # Company Profile
│   ├── api/
│   │   ├── contact/route.ts # Contact form handler
│   │   └── subscribe/route.ts # Newsletter handler
│   ├── sitemap.ts           # Auto-generated sitemap
│   └── robots.ts            # Robots.txt
├── components/
│   ├── layout/              # Navbar, Footer
│   ├── sections/            # Hero, About, Services, Solutions, etc.
│   ├── effects/             # CosmicCanvas, MouseTrail, FadeIn
│   ├── ui/                  # shadcn/ui components
│   └── analytics/           # Google Analytics, Facebook Pixel
├── data/                    # Content data files
│   ├── services.ts
│   ├── solutions.ts
│   ├── testimonials.ts
│   ├── social-links.ts
│   └── navigation.ts
├── lib/                     # Utilities
│   ├── utils.ts             # cn() helper
│   ├── email.ts             # Resend integration
│   └── validations.ts       # Zod schemas
└── public/
    └── images/              # Static images
```

## Pages

| Route | Description | Type |
|---|---|---|
| `/` | Homepage (hero, about, services, solutions, testimonials, blogs, contact) | Static |
| `/services/ai` | AI Solutions detail | SSG |
| `/services/automation` | AI Automation detail | SSG |
| `/services/cybersecurity` | Cybersecurity detail | SSG |
| `/services/ict` | ICT Services detail | SSG |
| `/services/computer` | Computer Services detail | SSG |
| `/services/network-data` | Network & Data detail | SSG |
| `/terms` | Terms of Service | Static |
| `/privacy` | Privacy Policy | Static |
| `/profile` | Company Profile | Static |
| `/api/contact` | Contact form endpoint | Dynamic |
| `/api/subscribe` | Newsletter endpoint | Dynamic |

## Features

### Preserved from Original Site
- ✅ Brand teal (#1abc9c) color scheme
- ✅ Montserrat headings + Lato body fonts
- ✅ Cosmic starfield canvas animation (mouse-interactive)
- ✅ Card hover effects (lift, shadow, image zoom)
- ✅ Dark/light mode toggle with persistence
- ✅ Mouse trail effect
- ✅ Scroll-triggered fade-in animations
- ✅ Social media links (Facebook, Twitter, LinkedIn, Instagram, YouTube)
- ✅ Subscribe form + contact form

### New Improvements
- ✅ **Zero jQuery** — removed security vulnerabilities
- ✅ **Zero Bootstrap** — removed 150KB+ dead CSS
- ✅ **No duplicated CSS** — was 2000+ lines across 9 files
- ✅ **TypeScript** — full type safety
- ✅ **SEO** — auto-generated sitemap, robots.txt, per-page metadata, Schema.org JSON-LD
- ✅ **301 redirects** from old `.html` URLs to new routes
- ✅ **API routes** ready for email integration
- ✅ **Image optimization** via `next/image`
- ✅ **Performance** — Lighthouse 90+ target

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push this repo to GitHub
2. Import into Vercel
3. Add environment variables:

```
NEXT_PUBLIC_GA_ID=G-C1V1G33QVD
NEXT_PUBLIC_FB_PIXEL_ID=1479801696585443
RESEND_API_KEY=your_resend_api_key
CONTACT_EMAIL=gashotechnologies@gmail.com
```

Vercel auto-detects Next.js — no configuration needed.

### URL Redirects (Vercon)

Old `.html` URLs automatically redirect to new routes:
| Old URL | New Route |
|---|---|
| `/solutions_ai.html` | `/services/ai` |
| `/solutions_automation.html` | `/services/automation` |
| `/solutions_cybersecurity.html` | `/services/cybersecurity` |
| `/solutions_ict.html` | `/services/ict` |
| `/solutions_computer.html` | `/services/computer` |
| `/solutions_network_data.html` | `/services/network-data` |
| `/terms_of_service.html` | `/terms` |
| `/privacy_policy.html` | `/privacy` |
| `/MyProfile/profile.html` | `/profile` |

## Development

```bash
# Start dev server (with Turbopack)
npm run dev

# Lint
npm run lint

# Production build
npm run build

# Analyze bundle (add @next/bundle-analyzer)
npx next build --experimental-analyze
```

## License

© 2026 GashoTech. All rights reserved.
