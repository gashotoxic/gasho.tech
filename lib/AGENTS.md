# DOX -- lib/

**Shared library code — utilities, API clients, auth helpers**

## Purpose

Cross-cutting helpers: API integrations, validation schemas, utility functions, auth wrappers. Importable from any route or component.

## Ownership

- `admin-client.ts` — browser-side admin session helpers (localStorage token, refresh)
- `auth.ts` — admin session signing/verification (`BLOG_ADMIN_PASSWORD` + `BLOG_SESSION_SECRET`); fail-closed
- `blogs.ts` — `BlogPost` type and pure helpers (`latestPublishedPosts`). NO data import: importable from client and server alike
- `blogs-data.ts` — **server-only** access to the build-time `data/blogs.json` snapshot. Never import it from a `"use client"` module: it bundles the whole archive (every body, drafts included) into a public chunk. Guarded by `test/blogs-client-bundle.test.ts`
- `email.ts` — Email service integration
- `github.ts` — GitHub API client (commit/read `data/blogs.json` for publishing)
- `studio-api.ts` — Internal studio API client
- `utils.ts` — `cn()` and other generic utilities
- `validations.ts` — Zod schemas for form validation
