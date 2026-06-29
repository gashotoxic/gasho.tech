# DOX -- lib/

**Shared library code — utilities, API clients, auth helpers**

## Purpose

Cross-cutting helpers: API integrations, validation schemas, utility functions, auth wrappers. Importable from any route or component.

## Ownership

- `auth.ts` — Clerk auth helpers for server components
- `blogs.ts` — Blog post access logic
- `email.ts` — Email service integration
- `github.ts` — GitHub API client (Top Language Info on profile)
- `studio-api.ts` — Internal studio API client
- `utils.ts` — `cn()` and other generic utilities
- `validations.ts` — Zod schemas for form validation
