# DOX -- data/

**Static data files — blog metadata, navigation, services, testimonials**

## Purpose

Single source of truth for content that lives in JSON/TS but is consumed at build/render time. Avoid hardcoding content in components.

## Ownership

- `blogs.json` — Blog post metadata (schema: slug, title, excerpt, content, author, category, date, image, published). Slugs MUST be unique — a duplicate slug doubles the sitemap entry. `scripts/ingest-blog.mjs` upserts by slug and hard-fails on duplicates. **PUBLIC BY CONSTRUCTION**: this repository is public, so every stored post body is readable unauthenticated at `raw.githubusercontent.com/gashotoxic/gasho.tech/main/data/blogs.json`, and it stays readable in git history. Treat `published: false` as a visibility filter for the site, never as confidentiality: do not store embargoed, personal or otherwise sensitive content here. Server code reads it through `lib/blogs-data.ts` (never from a client component). The admin form has no draft toggle: a new post is published on save, and an edit keeps whatever visibility the stored post already has.
- `services.ts` — Service offerings and descriptions. Optional `internal: true` marks an app-tier service that still resolves at `/services/<slug>` and stays in the sitemap but is hidden from the homepage service cards.
- `navigation.ts` — Site nav structure (consumed by `components/layout/navbar.tsx`)
- `projects.ts` — Projects showcase entries plus the Tier 1 + share-link gates (spec: `~/.hermes/SHARED/kenya-projects-pipeline-spec.md`; Release Format v1.1: `~/.hermes/SHARED/gashotech-projects-release-format.md`). `status: "live"` is presented only when every `tier1` check is true; `internal` entries are hidden from the grid, the sitemap and llms.txt, and their detail route 404s without a valid `?k=` share key (only a SHA-256 `shareKeyHash` is stored — never the plaintext key). Never set a `tier1` flag without verified evidence.
- `solutions.ts` — Solutions/use-cases data
- `testimonials.ts` — Customer testimonials
- `social-links.ts` — Social media links
- `image-prompts.json` — AI image generation prompts for blog visuals
