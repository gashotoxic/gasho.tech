# DOX -- data/

**Static data files — blog metadata, navigation, services, testimonials**

## Purpose

Single source of truth for content that lives in JSON/TS but is consumed at build/render time. Avoid hardcoding content in components.

## Ownership

- `blogs.json` — Blog post metadata (schema: slug, title, excerpt, content, author, category, date, image, published). Slugs MUST be unique — a duplicate slug doubles the sitemap entry. `scripts/ingest-blog.mjs` upserts by slug and hard-fails on duplicates.
- `services.ts` — Service offerings and descriptions. Optional `internal: true` marks an app-tier service that still resolves at `/services/<slug>` and stays in the sitemap but is hidden from the homepage service cards.
- `navigation.ts` — Site nav structure (consumed by `components/layout/navbar.tsx`)
- `projects.ts` — Projects showcase entries plus the Tier 1 gate (spec: `~/.hermes/SHARED/kenya-projects-pipeline-spec.md`). `status: "live"` is presented only when every `tier1` check is true; `draft` entries are hidden from the grid, the sitemap and the detail route. Never set a `tier1` flag without verified evidence.
- `solutions.ts` — Solutions/use-cases data
- `testimonials.ts` — Customer testimonials
- `social-links.ts` — Social media links
- `image-prompts.json` — AI image generation prompts for blog visuals
