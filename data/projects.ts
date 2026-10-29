/**
 * Projects showcase data — Kenya Projects Pipeline (Phase 1).
 *
 * Spec: ~/.hermes/SHARED/kenya-projects-pipeline-spec.md (§3.2 data model, §6 Tier 1, §7 flagship)
 * Answer key: ~/.hermes/SHARED/kenya-projects-pipeline-answer-key.md
 *
 * Hard rules encoded here (not by convention):
 * - `projects` is typed as `Project[]`, so a missing required field fails `npm run build`.
 * - Release Format v1.1 (spec: ~/.hermes/SHARED/gashotech-projects-release-format.md §2;
 *   R1 = public teaser, ruled by @user 2026-10-10): every project is `draft`, `internal`,
 *   `preview` or `live`. Public copy is **complete or absent** — no checklists, no "X of 12",
 *   no status notes are ever rendered (the checklist lives here as the gate, not as copy).
 * - A project renders as **live** only when `status === "live"` AND every `tier1` value is
 *   `true`. Two enforcement arms, both required:
 *   1. TYPE LEVEL — `Project` is a discriminated union: `status: "live"` is only typable
 *      when `tier1` is `Record<Tier1Check, true>`. A live entry with any false flag is a
 *      compile error (`tsc` / `npm run build` fail) and cannot be written at all.
 *   2. BUILD TIME — `validateProjects()` runs at module load and throws on any violation,
 *      so entries that reached the data through casts or non-TS tooling still fail
 *      `npm run build` instead of shipping. Live entries also require non-empty
 *      `liveUrl` / `githubUrl` / `readmeUrl` / `demoVideoUrl` (verifier MINOR-1).
 *   The render helpers (`isLiveProject()` / `effectiveStatus()`) apply the gate at runtime
 *   as a third, defence-in-depth layer. Failing-case guard: `scripts/check-tier1-gate.mjs`.
 * - Visibility per state (§2): `draft` entries are hidden from every surface and their
 *   detail route 404s unconditionally (a build starts here, hidden). `internal` entries are
 *   absent from the grid, the sitemap and llms.txt, and their detail route 404s (fail closed)
 *   unless the request carries `?k=<key>` matching the SHA-256 hash in the entry
 *   (`isShareGated()` / `verifyShareKey()`). `preview` entries keep a clean public teaser +
 *   detail page but stay out of the sitemap and llms.txt until they go `live`.
 *
 * Public links follow the same "complete or absent" rule (user directive 2026-10-28).
 * `liveUrl`, `demoVideoUrl`, `githubUrl`, `readmeUrl` and `hosting.url` are each either a
 * real absolute http(s) URL or the empty string, and the empty string renders as NOTHING —
 * never an empty button, never a dead href. `projectLinks()` is the single ordered
 * projection that both the card grid and the detail page render: live demo first, then the
 * video demo, then the repo. That ordering IS the fallback — a project that is not hosted
 * still shows its explainer video in the same place, and a project with a private repo
 * simply has no GitHub link. `validateProjects()` rejects any non-empty value that is not a
 * real URL, for every state, so a placeholder like "n/a" fails `npm run build` instead of
 * shipping.
 *
 * Tier 1 flags are set from VERIFIED evidence, never from intent. If a check cannot be
 * demonstrated, it is `false` even when the platform "probably" does it — the gate exists
 * to keep unverified claims out of the showcase. `tier1Notes` records which checks are
 * failed vs merely unverified as **internal truth only** — it is never rendered publicly
 * (§2 rule 3).
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** The 12 mandatory Tier 1 checks (spec §6). Every live project must clear all of them. */
export const TIER1_CHECKS = [
  "readme5min",
  "demoVideo60s",
  "publicGithub",
  "promptsVersioned",
  "modelCallsLogged",
  "toolOutputsValidated",
  "retriesWithBackoff",
  "secretsStripped",
  "humanApprovalOnMoneyEmailDelete",
  "streamingResponses",
  "repeatQueriesCached",
  "budgetCap",
] as const;

export type Tier1Check = (typeof TIER1_CHECKS)[number];

/** Fields shared by every entry, regardless of gate state. */
interface ProjectBase {
  slug: string; // url-safe, immutable once published
  title: string;
  tagline: string; // ≤ 120 chars (enforced by validateProjects())
  problem: string; // the painful/boring workflow, 2-4 sentences
  workflow: string; // what the agent does, newline-separated step flow
  agentArchitecture: {
    models: string[]; // e.g. ["cline-pass/glm-5.3 (routing)", "deepseek-v4.1-flash (fallback)"]
    tools: string[]; // MCP / APIs / browser fallback
    memory: string; // how state persists
    routing: string; // easy→small / hard→reasoning
  };
  /**
   * The demo links (user directive 2026-10-28). Every slot is either a real absolute
   * http(s) URL or `""` — and `""` renders as nothing at all. Never store "n/a", "TODO" or
   * a bare path here: `validateProjects()` fails the build on any non-empty non-URL value.
   */
  liveUrl: string; // the live page anyone can try; "" when the project is not hosted publicly
  hosting: { provider: string; plan: string; region: string; url: string };
  githubUrl: string; // the repo, ONLY while it is public — "" for a private repo (a link nobody can open helps nobody)
  readmeUrl: string; // 5-minute architecture README
  demoVideoUrl: string; // explainer / demo video (YouTube, X, or a self-hosted mp4); the fallback demo when nothing is hosted
  /**
   * Optional visible-label override per slot, for a destination whose honest name is not the
   * generic one — e.g. a `liveUrl` that is a dashboard, not a demo. The accessible name is
   * built from the resolved label, so an override keeps WCAG 2.5.3 (label in name) intact.
   * Read only by `projectLinks()`; the defaults live in `LINK_LABELS`.
   */
  linkLabels?: Partial<Record<ProjectLinkKind, string>>;
  /**
   * Optional per-check note. Only set for checks that are `false`, and only to say WHY —
   * "missing" (does not exist yet) vs "unverified" (exists but not demonstrated). Never
   * set a note for a check marked `true`: a passing check needs evidence, not prose.
   * Internal truth (Release Format v1.1 §2 rule 4) — never rendered on any public surface.
   */
  tier1Notes?: Partial<Record<Tier1Check, string>>;
  /**
   * SHA-256 hex digest of the share key for `?k=` links (Release Format v1.1 §2 rule 1).
   * The plaintext key is NEVER stored here — only its hash. An entry carrying one is
   * reachable on the detail route only with a key that hashes to it (fail closed), and an
   * `internal` entry without one is permanently unreachable. Format enforced by
   * `validateProjects()`.
   */
  shareKeyHash?: string;
  publishedAt?: string; // ISO date
  metrics?: { costPerTask?: string; uptime?: string };
}

/**
 * Gate arm 1 (type level). `status: "live"` is only typable when every `tier1` check is the
 * literal `true` — writing a live entry with any false flag is a compile error, before the
 * code is ever built or run. (Entries that bypass the type system via casts are caught at
 * build time by `validateProjects()`.)
 */
export interface LiveProject extends ProjectBase {
  status: "live";
  tier1: Record<Tier1Check, true>;
}

/**
 * A draft/internal/preview entry carries an honest gate map — any mix of true and false —
 * and is never presented as live while it does.
 */
export interface PendingProject extends ProjectBase {
  status: "draft" | "internal" | "preview";
  tier1: Record<Tier1Check, boolean>;
}

export type Project = LiveProject | PendingProject;

/** The four states of Release Format v1.1. */
export type ProjectStatus = "draft" | "internal" | "preview" | "live";

// ---------------------------------------------------------------------------
// Demo links — one ordered projection, rendered by every surface (2026-10-28)
// ---------------------------------------------------------------------------

/** The five link slots a project can expose. The array order IS the render order. */
export const PROJECT_LINK_KINDS = ["live", "video", "repo", "readme", "hosting"] as const;

export type ProjectLinkKind = (typeof PROJECT_LINK_KINDS)[number];

/**
 * What a project card shows: the three the user asked for, in this order. The detail page
 * renders all five. Both go through `projectLinks()`, so the ordering rule — live demo
 * first, video demo second, repo third — cannot drift between the surfaces.
 */
export const CARD_LINK_KINDS: readonly ProjectLinkKind[] = ["live", "video", "repo"];

/** A link the UI is allowed to render. `href` is always a trimmed absolute http(s) URL. */
export interface ProjectLink {
  kind: ProjectLinkKind;
  label: string; // visible text
  href: string;
  ariaLabel: string; // accessible name: project, destination and the new-tab behaviour
}

const LINK_LABELS: Record<ProjectLinkKind, string> = {
  live: "Live demo",
  video: "Video demo",
  repo: "GitHub",
  readme: "README",
  hosting: "Hosting",
};

/** The stored field behind each slot — validation errors name the FIELD, so they grep. */
const LINK_FIELDS: Record<ProjectLinkKind, string> = {
  live: "liveUrl",
  video: "demoVideoUrl",
  repo: "githubUrl",
  readme: "readmeUrl",
  hosting: "hosting.url",
};

/**
 * Accessible name per slot. The resolved visible label is interpolated VERBATIM into the
 * name, so WCAG 2.5.3 (label in name) holds for the defaults AND for a project that overrides
 * one — an accessible name that does not contain the visible text breaks voice control
 * ("click Tender dashboard").
 */
const LINK_ARIA: Record<ProjectLinkKind, (title: string, label: string) => string> = {
  live: (title, label) => `${title} — ${label} (opens in a new tab)`,
  video: (title, label) => `${title} — ${label} (opens in a new tab)`,
  repo: (title, label) => `${title} — ${label}: view the source code (opens in a new tab)`,
  readme: (title, label) => `${title} — ${label}: read the architecture (opens in a new tab)`,
  hosting: (title, label) => `${title} — ${label}: open the hosting page (opens in a new tab)`,
};

/**
 * A real, absolute, clickable http(s) URL. Everything else — `""`, whitespace, "n/a",
 * "TODO", "https://", "javascript:…", a bare path — means "no link" and stays hidden.
 * This is the only place the question is answered for hrefs: `validateProjects()` uses it to
 * fail the build on a placeholder, and the UI uses it to drop a link instead of rendering a
 * dead one. Credentials in the authority (`https://user:pass@host`) are refused: they would
 * hand a password to anyone who clicks, and nothing here ever needs them. `<`, `>`, `"`, the
 * bidi controls (U+061C, U+200E/F, U+202A–E, U+2066–9), zero-width and other invisible
 * formatting characters (U+200B–D, U+2060, U+FEFF, U+180E, U+0085), ASCII control characters
 * and the backslash are refused too, so a URL-shaped string can never smuggle markup into a
 * sink that does not escape (JSON-LD is serialized via `toJsonLd()` as well) and cannot be
 * read as a different URL than the one written — browsers normalize `\` to `/`.
 *
 * Refusing U+200C/U+200D also refuses the legitimate uses of ZWNJ/ZWJ in IDN paths (Persian,
 * Indic). That is a deliberate trade: no shipped URL needs them, and a rejected value fails
 * the build loudly rather than rendering a URL nobody can verify. If such a URL ever lands,
 * relax this gate for post-parse values instead of deleting the character from the set.
 */
export function isRenderableUrl(raw: string | undefined): boolean {
  const value = (raw ?? "").trim();
  if (!/^https?:\/\/\S+\.\S+$/i.test(value)) return false;
  if (/[<>"\\\u0000-\u001f\u007f\u0085\u061c\u200b\u200c\u200d\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\u180e\ufeff]/.test(value)) return false;
  const authority = value.replace(/^https?:\/\//i, "").split(/[/?#]/, 1)[0];
  return !authority.includes("@");
}

/** The link slots in render order, with the raw stored values. */
function linkSlots(
  project: Project,
): ReadonlyArray<readonly [ProjectLinkKind, string | undefined]> {
  return [
    ["live", project.liveUrl],
    ["video", project.demoVideoUrl],
    ["repo", project.githubUrl],
    ["readme", project.readmeUrl],
    ["hosting", project.hosting?.url],
  ];
}

/**
 * The links to render, in order, with missing ones simply absent.
 *
 * This is the fallback rule in one place: because the list is filtered rather than
 * branched, a project that is not hosted shows its video demo exactly where the live demo
 * would have been, a project with both shows both (live first), and a project with neither
 * yields an empty list — which the component renders as reserved whitespace, not a button.
 * Identical destinations collapse to the first (highest-priority) slot — compared with the
 * trailing slash normalized away, so `hosting.url` pointing at `…/tenders/` while `liveUrl`
 * points at `…/tenders` does not produce two links to one page.
 */
export function projectLinks(
  project: Project,
  kinds: readonly ProjectLinkKind[] = PROJECT_LINK_KINDS,
): ProjectLink[] {
  const wanted = new Set<ProjectLinkKind>(kinds);
  const seen = new Set<string>();
  const links: ProjectLink[] = [];
  for (const [kind, raw] of linkSlots(project)) {
    if (!wanted.has(kind) || !isRenderableUrl(raw)) continue;
    const href = (raw as string).trim();
    const destination = normalizeHref(href);
    if (seen.has(destination)) continue;
    seen.add(destination);
    const label = project.linkLabels?.[kind]?.trim() || LINK_LABELS[kind];
    links.push({
      kind,
      label,
      href,
      ariaLabel: LINK_ARIA[kind](project.title, label),
    });
  }
  return links;
}

/** Two hrefs that differ only by trailing slashes are the same destination. */
function normalizeHref(href: string): string {
  return href.replace(/\/+$/, "") || href;
}

/**
 * True when a link resolves to exactly `path` (`https://x/tenders?q=1` → true for "/tenders").
 * Used to collapse the tender CTA into the live-link slot: the two must never both point at
 * /tenders, or the hero carries two links to one page one block apart.
 *
 * Matching on PATH AND HOST is deliberately not required — GashoTech serves /tenders from
 * more than one of its own domains (gashotech.com, gasho.tech), and a host-pinned check would
 * let the duplicate CTA reappear the day the tender `liveUrl` moves to the other domain. The
 * cost of path-only matching is a hypothetical missing CTA if this URL ever pointed at a
 * different site's /tenders.
 *
 * Trailing slashes are ignored on both sides, so the answer cannot be silently falsified by
 * writing the path in the other form; the pathname is percent-decoded, so `/%74enders` (which
 * a browser, and therefore the server, reads as /tenders) still matches. A URL that does not
 * parse is never a match.
 */
export function linksToPath(href: string, path: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(href).pathname;
  } catch {
    return false;
  }
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Malformed escape (e.g. "%zz"): compare the raw pathname rather than throwing.
  }
  return pathname.replace(/\/+$/, "") === path.replace(/\/+$/, "");
}

/**
 * True when the project's live slot — the link the hero row renders first — opens exactly
 * `path`. The CTA that would duplicate that destination is hidden on this answer.
 *
 * Deliberately lives here beside `projectLinks()` rather than in the page: the projection and
 * the decision are then one module apart and cannot drift, so a slug rename or a moved
 * `liveUrl` changes this predicate and its tests together instead of silently restoring the
 * duplicate tender CTA. Only the live slot counts: a README or hosting link elsewhere does
 * not make the hero's call to action redundant.
 */
export function projectLinksTo(project: Project, path: string): boolean {
  const live = projectLinks(project).find((link) => link.kind === "live");
  return live !== undefined && linksToPath(live.href, path);
}

// ---------------------------------------------------------------------------
// Code gate — spec §3.2 / §6 / Release Format v1.1 §2
// ---------------------------------------------------------------------------

/** True only when every Tier 1 check passes. */
export function allTier1Pass(project: Project): boolean {
  return TIER1_CHECKS.every((check) => project.tier1[check] === true);
}

/**
 * The gate. A project is live ONLY when it declares `status: "live"` and every Tier 1
 * check is true. A `"live"` entry with any failing check is downgraded to `"preview"`
 * by `effectiveStatus()` so it can never be presented as live.
 */
export function isLiveProject(project: Project): boolean {
  return project.status === "live" && allTier1Pass(project);
}

/** The status a project is allowed to present as, after the Tier 1 gate is applied. */
export function effectiveStatus(project: Project): ProjectStatus {
  if (project.status === "draft" || project.status === "internal") return project.status;
  return isLiveProject(project) ? "live" : "preview";
}

/**
 * Visible in the public grid and reachable on the detail route without a share link:
 * `preview` and `live` only. Draft entries are hidden from every surface; internal entries
 * are absent from the grid, the sitemap and llms.txt and reachable only via share link (§2).
 */
export function isPublicProject(project: Project): boolean {
  return project.status === "preview" || project.status === "live";
}

/**
 * True when the detail route is reachable only through a share link (`?k=<key>`): the
 * `internal` state (§2 rule 1). Fail closed — `validateProjects()` guarantees an internal
 * entry carries a `shareKeyHash`, and `verifyShareKey()` rejects a missing one. Defence in
 * depth: an entry that somehow carries a `shareKeyHash` while declaring another state is
 * still treated as share-gated, so the gate cannot be bypassed by flipping `status`.
 */
export function isShareGated(project: Project): boolean {
  return project.status === "internal" || project.shareKeyHash !== undefined;
}

/**
 * Share-link check (§2 rule 1), server-side only. Compares the SHA-256 of the provided key
 * against the stored hash in constant time. Fail closed: a missing key, a missing hash or a
 * malformed hash never validates. The plaintext key is never stored or compared directly.
 */
export function verifyShareKey(shareKeyHash: string | undefined, providedKey: string | undefined): boolean {
  if (!shareKeyHash || !providedKey) return false;
  const expected = Buffer.from(shareKeyHash, "hex");
  const actual = createHash("sha256").update(providedKey, "utf8").digest();
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Gate arm 2 (build time). Called at module load — `next build` evaluates this module, so a
 * violating entry fails the build even when it bypassed the type system (casts, non-TS
 * tooling). Also enforces the structural rules the type system cannot express: the tier1 map
 * must be complete, slugs must be url-safe and unique, and taglines stay ≤ 120 chars
 * (spec §3.2).
 */
export function validateProjects(entries: readonly Project[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`projects.ts: entry is not an object: ${JSON.stringify(entry)}`);
    }
    const label = entry.slug || "(missing slug)";
    if (!["draft", "internal", "preview", "live"].includes(entry.status)) {
      throw new Error(`projects.ts: "${label}" has invalid status "${String(entry.status)}"`);
    }
    for (const check of TIER1_CHECKS) {
      if (typeof entry.tier1?.[check] !== "boolean") {
        throw new Error(`projects.ts: "${label}" — tier1.${check} must be a boolean`);
      }
    }
    if (entry.status === "live" && !allTier1Pass(entry)) {
      const failing = TIER1_CHECKS.filter((check) => entry.tier1[check] !== true);
      throw new Error(
        `projects.ts: "${label}" declares status "live" but these Tier 1 checks are false: ` +
          `${failing.join(", ")}. A project is live only when ALL ${TIER1_CHECKS.length} checks are true.`,
      );
    }
    if (entry.status === "live") {
      // MINOR-1 (hardened — re-landed 2026-10-12; the original hardening commit 0dae7e2 was
      // never merged: PR #23 was cut from the branch tip before the fixup, and PR #24
      // carrying it was wrongly closed as superseded). Whitespace-only, "n/a" and bare
      // "https://" all beat a plain truthiness check: every link a live card shows must be
      // a real trimmed http(s) URL, including the hosting link.
      const links: ReadonlyArray<readonly [string, string | undefined]> = [
        ["liveUrl", entry.liveUrl],
        ["githubUrl", entry.githubUrl],
        ["readmeUrl", entry.readmeUrl],
        ["demoVideoUrl", entry.demoVideoUrl],
        ["hosting.url", entry.hosting?.url],
      ];
      for (const [field, raw] of links) {
        const v = (raw ?? "").trim();
        if (!isRenderableUrl(v)) {
          throw new Error(
            `projects.ts: "${label}" declares status "live" but ${field} is not a real http(s) url ` +
              `(${JSON.stringify(raw ?? "")}) — a live entry must link its demo, repo, README, ` +
              `demo video and hosting with real URLs.`,
          );
        }
      }
    }
    // Every link slot, in EVERY state, is either empty (renders as nothing) or a real
    // absolute http(s) URL (user directive 2026-10-28). A "n/a", a "TODO", a bare path or a
    // half-typed "https://" is a dead href on a public card, so it fails the build here
    // rather than being silently dropped by the renderer.
    for (const [kind, raw] of linkSlots(entry)) {
      const value = (raw ?? "").trim();
      if (value !== "" && !isRenderableUrl(value)) {
        throw new Error(
          `projects.ts: "${label}" — ${LINK_FIELDS[kind]} must be empty or a real absolute http(s) url ` +
            `(got ${JSON.stringify(raw ?? "")}) — a missing link is hidden, never faked.`,
        );
      }
    }
    // Share links exist only for the `internal` state (§2 rule 1): an internal entry must
    // carry its SHA-256 share-key hash (otherwise it would silently behave like a draft),
    // and no other state may carry one.
    if (entry.status === "internal" && entry.shareKeyHash === undefined) {
      throw new Error(
        `projects.ts: "${label}" is "internal" but has no shareKeyHash — an internal entry ` +
          `is only reachable through its share link, so the key hash must be stored (use ` +
          `status "draft" for an entry with no share link).`,
      );
    }
    if (entry.status !== "internal" && entry.shareKeyHash !== undefined) {
      throw new Error(
        `projects.ts: "${label}" carries a shareKeyHash but is "${entry.status}" — share ` +
          `links exist only for the "internal" state.`,
      );
    }
    if (entry.shareKeyHash !== undefined && !/^[0-9a-f]{64}$/.test(entry.shareKeyHash)) {
      throw new Error(`projects.ts: "${label}" — shareKeyHash must be a SHA-256 hex digest (64 lowercase hex chars)`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)) {
      throw new Error(`projects.ts: "${label}" — slug must be url-safe, lowercase and hyphenated`);
    }
    if (seen.has(entry.slug)) {
      throw new Error(`projects.ts: duplicate slug "${label}" — a duplicate doubles the sitemap entry`);
    }
    seen.add(entry.slug);
    if (entry.tagline.length > 120) {
      throw new Error(`projects.ts: "${label}" — tagline is ${entry.tagline.length} chars (max 120)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export const projects: Project[] = [
  /**
   * Flagship — decided by @user 2026-10-06 (spec §7): the GT-ASSIST-V2 platform itself.
   * Ships as `"preview"` on purpose (R1 = public teaser, ruled by @user 2026-10-10): a clean
   * teaser card and a clean detail page — complete copy only, no checklist or gap notes.
   * One of the twelve Tier 1 checks is still outstanding (modelCallsLogged),
   * so the gate keeps it out of the sitemap and
   * llms.txt until it clears.
   *
   * `secretsStripped` passes on verified evidence (re-scanned 2026-10-08): a scan of every
   * live JS/CSS asset found zero secret key material — publishable (pk_) keys are public by design.
   * The client-secret remediation and key rotation hold, and the app's build fails on any
   * key shape reaching its output (`scripts/scan-dist-secrets.mjs`, on main). Keep published
   * copy at category level — never name the exact wiring or the exposure mechanism.
   */
  {
    slug: "gt-assist-v2",
    title: "GT-ASSIST-V2",
    tagline: "One Kenyan account for multi-model AI chat, image, video and voice — billed in KES.",
    problem:
      "A Kenyan team that wants AI in its daily work ends up juggling half a dozen separate tools — " +
      "one for chat, one for images, one for video, one for transcription — each with its own USD " +
      "subscription, its own login, and no way to pay in shillings. Usage is impossible to budget, " +
      "and most tools cannot even be trialled without a foreign card. GT-ASSIST-V2 puts the whole set " +
      "behind a single account with one credit balance and local payment rails.",
    workflow:
      "1. The user signs in and receives a daily free credit allowance; top-ups go through a Paystack- or Stripe-style checkout they confirm themselves.\n" +
      "2. They send a chat message; the app routes the request to a model suited to the job.\n" +
      "3. The reply streams back token by token, with tool calls (web search, knowledge base) surfaced inline.\n" +
      "4. Media requests branch off the same credit balance: images, image edits, video animation, speech-to-text and text-to-speech.\n" +
      "5. Conversations, media and the credit ledger sync to the user's account so any device resumes where they left off.\n" +
      "6. Rate-limited provider calls retry with exponential backoff and jitter rather than failing the user's request.",
    agentArchitecture: {
      models: [
        "Modes: chat, image generation and editing, video animation, speech-to-text, text-to-speech — all from one credit balance.",
        "Everyday chat — DeepSeek V3.2 / V4-Flash (fast lane, 1 credit)",
        "Long-context work — Kimi K2.6 / K3",
        "Hard reasoning — GLM-5.1 / GLM-5.2 and Qwen3 235B-Thinking",
        "Images — Qwen-Image-2512 + FLUX.1 schnell; video — LTX 2.5 (i2v/t2v)",
        "Audio — Whisper (speech-to-text) and Kokoro TTS (text-to-speech)",
      ],
      tools: [
        "Model & media gateways — e.g. Chutes or OpenRouter style providers, one place to reach open chat, image, video and audio models",
        "Payment processors — e.g. Paystack or Stripe style, so top-ups happen in KES and every one is confirmed by the customer",
        "Identity — a hosted sign-in provider keeps one account across devices",
        "Cloud data — a managed Postgres-style sync backend keeps state consistent everywhere",
        "Grounding — web search and a knowledge base, so answers can be checked against sources",
        "Resilience — standard retry-with-backoff on transient provider errors, so hiccups stay invisible to the user",
      ],
      memory:
        "A managed cloud database keeps conversations, generated media and the per-user credit ledger in sync across devices — including the conversation branch/edit history — so any device resumes exactly where the last one left off.",
      routing:
        "The user picks a model per task, and the platform groups them by cost and depth: 1-credit lanes (DeepSeek V4-Flash, Qwen3.6-27B) for everyday chat, reasoning lanes (Kimi K3, GLM-5.2, Qwen3-235B-Thinking) for hard work, with media models routed by task type.",
    },
    liveUrl: "https://create.gashotech.com",
    hosting: {
      provider: "Vercel",
      plan: "Hobby",
      region: "US East (edge)",
      url: "https://create.gashotech.com",
    },
    // Public as of 2026-10-08 (repo made public after the history scrub), so this can finally
    // point at the real repo instead of being left empty.
    githubUrl: "https://github.com/gashotoxic/GT-ASSIST-V2",
    // Public repo (2026-10-08), so this points at the real README — the architecture
    // section ("## Architecture (5-minute read)") lives in the repo README.md itself
    // since PR #39. The public/docs/ mirror is a legacy fallback from the private era;
    // dropping it is queued as a follow-up once inbound links are checked.
    readmeUrl: "https://github.com/gashotoxic/GT-ASSIST-V2/blob/main/README.md",
    // 60s product walkthrough, recorded 2026-10-07 (60.000s, verified frame-by-frame).
    demoVideoUrl: "https://gashotech.com/videos/gt-assist-v2-demo.mp4",
    status: "live",
    tier1: {
      readme5min: true, // 2026-10-10 (ruling R3): the "## Architecture (5-minute read)" section (585 words, ~3 min) landed in the GT-ASSIST-V2 repo README.md — origin/main @ 5bce31c (PR #39)
      demoVideo60s: true, // 60.000s walkthrough recorded and linked (verified frame-by-frame)
      publicGithub: true, // 2026-10-08: repo made PUBLIC (user call) after the BFG history scrub removed the committed .env — leaked blob 292ff63 verified GONE by fresh clone; pre-flight scan of ALL history found 0 real secrets (6 hits were doc placeholders: `sk_test_...` in docs/SETUP.md + a key-format description in docs/PAYSTACK_SETUP_GUIDE.md). Verified logged-out HTTP 200 on the repo page and the unauthenticated API.
      promptsVersioned: true, // model/prompt configs versioned in repo
      modelCallsLogged: true, // 2026-10-12: per-call log (prompt/model/latency/status) on every provider lane — knowledge-base embedding calls routed through the logger by PR #46 (e3abf3f) closing the last bypass; prompts secret-scrubbed + truncated; scripts/model_call_log_smoke.mjs all green (run 2026-10-12)
      toolOutputsValidated: true, // 2026-10-11: services/toolOutputValidation.ts fail-closed guards wired into search, knowledge base and brand-studio tools; scripts/tool_validation_smoke.mjs green
      retriesWithBackoff: true, // standard retry with backoff on transient provider errors
      secretsStripped: true, // re-verified 2026-10-08: every live asset scanned clean + key rotated
      humanApprovalOnMoneyEmailDelete: true, // payment checkout confirmed by the customer
      streamingResponses: true, // replies stream back token by token
      repeatQueriesCached: true, // 2026-10-11: services/queryCache.ts + query_cache migration (per-user sha256 keys, per-kind TTLs); chat/search/knowledge lanes wired; scripts/query_cache_smoke.mjs green
      budgetCap: true, // unified credit system, free daily allowance + paid packs
    },
    // `tier1Notes` deliberately omitted: gasho.tech is a PUBLIC repo and internal gap status
    // must not be readable on GitHub (Release Format v1.1 §2 rule 4 — internal truth lives in
    // kanban/verifier reports and the GIMA handoff doc, never a repo). 2026-10-08.
    publishedAt: "2026-10-12",
  },

  /**
   * Project #2 (spec §7): Tender / RFQ Finder + Bid Drafter.
   *
   * Full pipeline provenance: idea scored 32/35 by the Phase 2 researcher (run R-20261010-01),
   * built by GIMA 2026-10-06/07 (independent verifier PASS 14/14), audited again 2026-10-17
   * (fresh end-to-end run clean). Flipped `draft` -> `preview` 2026-10-17 on @user's call —
   * the flagship established the release format and this is the first project to follow it.
   * Release Format v1.1 §4: stays `preview` until its own Tier 1 is 12/12 with evidence,
   * then flips `live` through the same gate the flagship used.
   */
  {
    slug: "tender-rfq-finder",
    title: "Tender / RFQ Finder + Bid Drafter",
    tagline: "Scans Kenyan tender boards for the RFQs a business can actually win, then drafts the response.",
    problem:
      "Kenyan SMEs and contractors read tenders.go.ke and dozens of county portals by hand " +
      "every week. Promising RFQs slip past unnoticed, deadlines get missed in the noise, and " +
      "every bid restarts the same boilerplate from a blank page.",
    workflow:
      "1. Fetch the open tenders from Kenya's national procurement portal — 500+ live per run — " +
      "with graceful degradation when a source is blocked or stale.\n" +
      "2. Score every tender 0–5 on five axes: capability fit, deadline feasibility, buyer " +
      "credibility, value attractiveness and competition. Deterministic rubric — same input, " +
      "same scores, and every number traces back to a real source URL.\n" +
      "3. Flag the top picks and write a first-draft bid response for each: company profile, " +
      "capability mapping to the tender's requirements, compliance checklist, pricing placeholder.\n" +
      "4. Ship one ranked report, deadline-aware and ready to work from.",
    agentArchitecture: {
      models: ["Deterministic Python pipeline — no model in the scoring path"],
      tools: ["National tender-portal API client", "Rate-limited HTTP with 24h fetch cache and retry/backoff"],
      memory: "24h fetch cache + per-run report history",
      routing: "One command: fetch → parse → score → ranked report + bid drafts",
    },
    // Live surface: the pipeline's ranked tender dashboard is published on this site and
    // renders publicly, so it is linked as the live slot — labelled "Tender dashboard", not
    // "Live demo", because the snapshot behind it is refreshed by a separate cron and its
    // `lastRefreshed` can be days old. Calling it a demo would export a freshness claim this
    // page cannot back (the stale-snapshot repair is tracked outside this repo).
    liveUrl: "https://gashotech.com/tenders",
    linkLabels: { live: "Tender dashboard" },
    hosting: { provider: "Self-hosted script", plan: "n/a", region: "n/a", url: "" },
    // Repo is not public: a link nobody can open helps nobody, so it stays empty and hidden
    // until the repo is actually made public.
    githubUrl: "",
    // The architecture README lives inside that repo: nothing public to link yet.
    readmeUrl: "",
    // Explainer video still pending. Empty renders as nothing; dropping the URL in here is a
    // data-only edit — no code change needed. It sits in the slot right after the live demo,
    // so it shows whenever this project is not hosted.
    demoVideoUrl: "",
    status: "preview",
    tier1: {
      readme5min: true, // 5-minute architecture + scoring rubric in README (verifier item 12, 2026-10-07)
      demoVideo60s: false,
      publicGithub: false,
      promptsVersioned: false,
      modelCallsLogged: false,
      toolOutputsValidated: true, // every parsed record schema-validated (tf/schema.py; tests + verifier item 3)
      retriesWithBackoff: true, // retry with exponential backoff on fetch failures (verifier item 7)
      secretsStripped: true, // zero credentials in code/outputs — env-sourced config only (verifier item 10)
      humanApprovalOnMoneyEmailDelete: false,
      streamingResponses: false,
      repeatQueriesCached: false,
      budgetCap: true, // per-run time/request/cost caps enforced (tf/http_client.py Budget.check; verifier item 9)
    },
  },
];

// Gate arm 2 fires at module load: `next build` (and any import of this module) throws on a
// violating entry instead of shipping it. Runs after the entries, so real data is checked
// the moment the module is evaluated.
validateProjects(projects);

export function getProject(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}

/** Public projects (preview teasers + live cards), newest first — what the grid renders. */
export function publicProjects(): Project[] {
  return projects
    .filter(isPublicProject)
    .slice()
    .sort((a, b) => {
      const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return db - da;
    });
}

/** Projects that clear the gate — what the sitemap lists. */
export function liveProjects(): Project[] {
  return projects.filter(isLiveProject);
}
