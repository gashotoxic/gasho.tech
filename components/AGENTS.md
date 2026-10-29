# DOX -- components/

**Shared React components — UI building blocks, layouts, effects**

## Purpose

Reusable React components used across routes. Organised by domain (analytics, layout, sections, ui primitives, effects).

## Ownership

- `ui/` — shadcn-style primitive components (buttons, dialogs, forms)
- `layout/` — Header, footer, navigation
- `sections/` — Page sections (hero, services grid, testimonials)
- `analytics/` — Tracking and analytics components
- `effects/` — Visual effects (mouse trail, background animations)
- `chat-widget.tsx` / `chat-widget-wrapper.tsx` — Embedded chat widget

## Local Contracts

- Components use TypeScript strict mode
- Path alias: `@/components/*` resolves to this directory
- Use Tailwind CSS classes via `clsx` + `tailwind-merge` (`cn` util in `lib/utils.ts`)
- Icons via `lucide-react`
- `sections/services.tsx` renders only public services — it filters out entries with `internal: true` from `data/services.ts` (app-tier offerings stay reachable via `/services/*`).
- `sections/blogs.tsx` is a **server component** (`app/page.tsx` renders it) and reads `lib/blogs-data`. Do not add `"use client"` to it or import the archive into any client component: that ships every post body to the browser. Interactivity belongs in the client children (`effects/fade-in.tsx`). Guard: `test/blogs-client-bundle.test.ts`.
