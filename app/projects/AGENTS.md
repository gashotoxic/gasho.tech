# DOX -- app/projects/

**Projects showcase — card grid and per-project detail pages**

Renders the GashoTech project showcase from `data/projects.ts`. `/projects` lists every
public entry (live cards + preview teasers); `/projects/[slug]` is the per-project detail
page, rendered per request (the share-link gate reads `?k=` at request time).

## Local Contracts

- Source of truth: `data/projects.ts` (DO NOT duplicate project content here)
- Visibility is decided in the data layer, never in the page: `publicProjects()` for the grid,
  `liveProjects()` for the sitemap and llms.txt, `isShareGated()` / `verifyShareKey()` for the
  detail route (share-gated entries 404 without a valid `?k=`), `notFound()` for unknown slugs
- Release Format v1.1 (§2 rule 3): public copy is complete or absent — the detail page shows
  only the problem, workflow steps, agent architecture summary and links. Never render the
  Tier 1 checklist, `tier1Notes`, "X of 12" badges or status footers
- Card contract: a live card shows exactly title, one-liner, Live demo + Hosting + GitHub
  links; a preview teaser adds a "Preview" badge and shows links as available; internal
  entries get no card
- Tier 1 gate: an entry is presented as live only when `status === "live"` AND every `tier1`
  check is true (`isLiveProject()` / `effectiveStatus()`). Never render a "Live" badge from
  `status` alone — a downgraded entry must not look live
- Tier 1 flags are set from verified evidence. A check that cannot be demonstrated stays
  `false`, and `tier1Notes` says whether it is missing or merely unverified (internal truth —
  never public)
- Slugs are URL-safe, lowercase, hyphenated, and immutable once published
- Each detail page exposes canonical + OpenGraph/Twitter metadata plus SoftwareApplication and
  BreadcrumbList JSON-LD, matching the `services/[slug]` pattern; share-gated pages carry
  `noindex` robots metadata
- Links render conditionally on empty strings: an unpublished repo or missing demo video must
  not appear as a dead link

## Verification

- `npm run build` — fails when a required `Project` field is missing from an entry (a live
  entry with an empty `liveUrl` / `githubUrl` / `readmeUrl` / `demoVideoUrl` also fails)
- `npm run check:tier1-gate` — failing-case guard for the Tier 1 and share-link gates
- After deploy: `/projects` and `/projects/<slug>` return 200 for public entries; an
  `internal` slug returns 404 without a valid share key and is absent from `sitemap.xml` and
  llms.txt
