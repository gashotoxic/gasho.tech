# DOX -- app/blogs/

**Blog routes — index, post pages, admin panel, studio**

## Purpose

`/blogs` and `/blogs/<slug>` render the live archive fetched from `GET /api/blogs` (`force-dynamic`; the deployed JSON is only a build-time snapshot). `/blogs/admin` is the post CRUD panel. `/blogs/studio` is the AI drafting studio.

## Local Contracts

- Source of truth: `data/blogs.json` in the repository, written through `/api/blogs` (DO NOT duplicate the data here)
- Runtime reads go through `GET /api/blogs`: published posts only for anonymous callers, drafts included for a `Bearer` admin session
- `admin/page.tsx` is a client component and MUST load the list from `GET /api/blogs` with the session token. Importing `lib/blogs-data` or `data/blogs.json` into it bundles every post body — drafts included — into a public chunk of `/blogs/admin`. Guard: `test/blogs-client-bundle.test.ts`
- The admin form has no draft toggle: a new post is published on save, and an edit keeps the stored post's visibility. `data/blogs.json` lives in a public repository, so a "draft" is only hidden from this site — never confidential
- Slugs must be URL-safe, lowercase, hyphenated
- Image dimensions: 1200x630 WebP (OG-compatible)
- Each post page must expose OpenGraph metadata
