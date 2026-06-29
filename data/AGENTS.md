# DOX -- data/

**Static data files — blog metadata, navigation, services, testimonials**

## Purpose

Single source of truth for content that lives in JSON/TS but is consumed at build/render time. Avoid hardcoding content in components.

## Ownership

- `blogs.json` — Blog post metadata (schema: slug, title, excerpt, content, author, category, date, image, published)
- `services.ts` — Service offerings and descriptions
- `navigation.ts` — Site nav structure
- `solutions.ts` — Solutions/use-cases data
- `testimonials.ts` — Customer testimonials
- `social-links.ts` — Social media links
- `image-prompts.json` — AI image generation prompts for blog visuals
