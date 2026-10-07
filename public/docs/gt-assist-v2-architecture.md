# GT-ASSIST-V2 — Architecture (5-minute read)

> This is the architecture section of the GT-ASSIST-V2 README, mirrored here for the
> showcase page while the repository is private. Canonical copy:
> `github.com/gashotoxic/GT-ASSIST-V2` → `README.md` → "Architecture (5-minute read)".

One credit balance powers every mode — chat, image generation and editing, video animation,
speech-to-text, and text-to-speech. This is how the whole thing fits together.

## The big picture

A React SPA (Vite) talks to three kinds of backends: Vercel functions that proxy model calls,
Clerk for identity, and Supabase (Postgres + Storage) for state. Payments run through
Paystack in KES.

```
Browser (React SPA)                Vercel functions               Providers
+----------------------+  HTTPS   +----------------------+       +-----------------+
| chat / media studio /| --------> | /api/chutes          | ----> | Chutes: LLM,    |
| Photoshop Corner     |  (SSE    | /api/search          |       | image, video,   |
|                      |  stream) | keys + guards live   | <---- | audio models    |
|                      | <------- | here                 |       +-----------------+
+----------+-----------+          +----------------------+
           |                               |
           v                               v
+----------------------+          +----------------------+
| Clerk (sign-in)      |          | Paystack (KES        |
| Supabase (Postgres,  |          | checkout, confirmed  |
| media storage, RLS)  |          | by the customer)     |
+----------------------+          +----------------------+
```

## Request flow (chat and media)

1. The SPA posts the request to a same-origin serverless route (`api/chutes.ts`).
2. The route injects the provider key from server-side environment variables — the key never
   reaches the browser — and forwards to the model gateway over an HTTPS-443 host allowlist.
   Upstream redirects are never followed, so the injected Authorization header cannot leave
   the allowlist.
3. The response streams straight back (SSE included); binary media passes through untouched.
4. Transient provider errors (429/503) are retried with exponential backoff + jitter
   (`services/retryFetch.ts`) before the user ever sees a failure.
5. Every api route carries a browser-Origin allowlist and per-IP rate limiting.

## Modes and model lanes

- **Chat** — fast lanes (Nemotron 3, DeepSeek V4-Flash, Qwen3.6-27B) for everyday work and
  reasoning lanes (Kimi K3, GLM-5.2, Qwen3-235B-Thinking) for hard problems, plus vision
  models for Brand mode.
- **Media Studio** — image generation + text-guided editing, image-to-video animation
  (LTX 2.5), speech-to-text (Whisper) and text-to-speech (Kokoro).
- **Photoshop Corner** — a full canvas editor that runs client-side. Manual editing is the
  primary path and works offline; AI tools are optional add-ons.

## State and memory

Supabase Postgres (row-level security) persists conversations — including message edits,
retries and full branch history — generated media, the knowledge base, and the per-user
credit ledger. Any device resumes exactly where the last one stopped.

## Credits and payments

Every action is priced in credits (`services/creditCosts.ts`): a free daily allowance plus
paid packs and subscriptions via Paystack in KES. A purchase lands in the ledger only after
Paystack confirms it server-side (webhook) — spending always has a human confirming the
checkout.

## Security model

- Provider keys live only in server-side env (`CHUTES_API_KEY`); nothing secret ships in the
  client bundle.
- `npm run build` finishes with `scripts/scan-dist-secrets.mjs`, which fails the build if any
  key shape reaches `dist/` — a reintroduced client secret cannot ship silently.
- Auth via Clerk; Supabase tables enforce RLS; the api proxy is not an open relay (host
  allowlist, no redirect following, Origin + per-IP rate guards).

## Repo map

| Path | What lives there |
|---|---|
| `api/` | Vercel functions — the server-side model/search proxy |
| `services/` | Provider clients, credit costs, retry/backoff, knowledge base, sync |
| `context/` | React contexts — auth, credits, app services |
| `components/` | chat, Media Studio, Photoshop Corner, shared UI |
| `database/` | SQL migrations + schema docs (RLS, credits, storage) |
| `lib/` | Paystack integration |
| `scripts/` | Build-time secret scan, API smoke tests |
