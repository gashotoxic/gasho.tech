# DOX -- app/api/blogs/

**Blog archive endpoint — public read, admin write**

## Purpose

`GET /api/blogs` is the only runtime source of the post list: `/blogs`, `/blogs/<slug>`, the admin panel and anything else that renders posts read it instead of the build snapshot. `POST` / `PUT` / `DELETE` write `data/blogs.json` in the repository through the GitHub contents API.

## Local Contracts

- GET is unauthenticated and returns **published posts only**. A `Bearer` admin session (`verifyToken`) gets the full list, drafts included. Always `Vary: Authorization`: anonymous responses are `public, s-maxage=60, stale-while-revalidate=300`, admin responses `private, no-store`. Never widen the anonymous projection — it is the public blog.
- Reads prefer the live file (`readBlogFile()`); the deployed build snapshot is a fallback for reads only, never for writes.
- Writes are read-modify-write pinned to the sha just read: no sha, no commit; a concurrent change is a 409 that writes nothing. A 404 from the contents API is a read failure, not an empty archive — an "empty list" write would replace the whole archive.
- `POST` refuses an archived slug (409 `exists`). `PUT` / `DELETE` require an existing slug and accept whitelisted fields only.
- Field validation lives in `lib/blog-post-update.ts` (slug normalisation, rooted `/images/…` paths, tag/readTime bounds). A new stored field needs a rule there too.
- Drafts are not confidential: `data/blogs.json` is in a public repository, so `published: false` is a visibility filter, not access control (see `data/AGENTS.md`).

## Verification

`test/blogs-route.test.ts` — the anonymous projection, the admin listing, the 409 races and the read-failure paths. `test/blog-post-update.test.ts` for the field rules.
