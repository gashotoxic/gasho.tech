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
  liveUrl: string; // working demo anyone can try
  hosting: { provider: string; plan: string; region: string; url: string };
  githubUrl: string; // public repo
  readmeUrl: string; // 5-minute architecture README
  demoVideoUrl: string; // 60-second demo recording
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
      // MINOR-1 (hardened after the wave-1 audit 2026-10-10 — whitespace-only, "n/a" and
      // bare "https://" all beat a plain truthiness check): every link a live card shows
      // must be a real trimmed http(s) URL, including the hosting link.
      const links: ReadonlyArray<readonly [string, string | undefined]> = [
        ["liveUrl", entry.liveUrl],
        ["githubUrl", entry.githubUrl],
        ["readmeUrl", entry.readmeUrl],
        ["demoVideoUrl", entry.demoVideoUrl],
        ["hosting.url", entry.hosting?.url],
      ];
      for (const [field, raw] of links) {
        const v = (raw ?? "").trim();
        if (!/^https?:\/\/\S+\.\S+/.test(v)) {
          throw new Error(
            `projects.ts: "${label}" declares status "live" but ${field} is not a real http(s) url ` +
              `(${JSON.stringify(raw ?? "")}) — a live entry must link its demo, repo, README, ` +
              `demo video and hosting with real URLs.`,
          );
        }
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
   * Four of the twelve Tier 1 checks are still outstanding (publicGithub, modelCallsLogged,
   * toolOutputsValidated, repeatQueriesCached), so the gate keeps it out of the sitemap and
   * llms.txt until they clear.
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
    // Left empty on purpose — the repo is PRIVATE until the user calls it (spec §7) and a
    // private URL would 404 for every visitor. Filled in when `publicGithub` flips true.
    githubUrl: "",
    // Mirrored copy of the README's architecture section (5-min read), served here so the
    // link works for every visitor while the repo is private. When `publicGithub` flips
    // true, switch this to the repo README URL and drop the public/docs/ mirror.
    readmeUrl: "https://gashotech.com/docs/gt-assist-v2-architecture.md",
    // 60s product walkthrough, recorded 2026-10-07 (60.000s, verified frame-by-frame).
    demoVideoUrl: "https://gashotech.com/videos/gt-assist-v2-demo.mp4",
    status: "preview",
    tier1: {
      readme5min: true, // 2026-10-10 (ruling R3): the "## Architecture (5-minute read)" section (585 words, ~3 min) landed in the GT-ASSIST-V2 repo README.md — origin/main @ 5bce31c (PR #39)
      demoVideo60s: true, // 60.000s walkthrough recorded and linked (verified frame-by-frame)
      publicGithub: false, // repo private; switch blocked on a git-history secret scrub (user call)
      promptsVersioned: true, // model/prompt configs versioned in repo
      modelCallsLogged: false, // not demonstrated
      toolOutputsValidated: false, // not demonstrated
      retriesWithBackoff: true, // standard retry with backoff on transient provider errors
      secretsStripped: true, // re-verified 2026-10-08: every live asset scanned clean + key rotated
      humanApprovalOnMoneyEmailDelete: true, // payment checkout confirmed by the customer
      streamingResponses: true, // replies stream back token by token
      repeatQueriesCached: false, // not demonstrated
      budgetCap: true, // unified credit system, free daily allowance + paid packs
    },
    tier1Notes: {
      publicGithub:
        "Missing — repo is private. The switch needs a git-history secret scrub and a user go-ahead.",
      modelCallsLogged:
        "Partial — the credit ledger logs every billed action, but no per-model-call log (prompt, model, latency) is surfaced.",
      toolOutputsValidated: "Unverified — tool output schemas not demonstrated.",
      repeatQueriesCached: "Unverified — no repeat-query cache demonstrated.",
    },
    publishedAt: "2026-10-06",
  },

  /**
   * Queued project #2 (spec §7): Tender / RFQ Finder + Bid Drafter.
   *
   * Placeholder only, and deliberately `status: "draft"` (Release Format v1.1 §4):
   * - it is NOT queued for a build here — it enters through the Phase 2 researcher backlog and
   *   gets rubric-scored like every other idea, so this entry gets replaced by the researcher's
   *   output when that lands;
   * - keeping one real draft entry means the draft-hiding rule (absent from the grid, the
   *   sitemap and llms.txt; the detail route 404s unconditionally) is demonstrable against
   *   production data, not just asserted.
   */
  {
    slug: "tender-rfq-finder",
    title: "Tender / RFQ Finder + Bid Drafter",
    tagline: "Scans Kenyan tender boards for the RFQs a business can actually win, then drafts the response.",
    problem:
      "Queued for scoring by the Phase 2 researcher. Working assumption: Kenyan SMEs that bid for " +
      "public and corporate tenders read the same boards by hand every week, miss deadlines, and " +
      "re-draft the same boilerplate sections for every bid.",
    workflow:
      "1. (Draft — scope to be set by the Phase 2 researcher's scored proposal.)\n" +
      "2. Planned shape: watch tender boards, score each RFQ against the company's profile, alert on the ones worth bidding, then assemble a first-draft response from the company's own past bids.",
    agentArchitecture: {
      models: ["TBD — assigned when the researcher's proposal is accepted"],
      tools: ["TBD — tender-board sources and browser fallback to be confirmed"],
      memory: "TBD",
      routing: "TBD",
    },
    liveUrl: "",
    hosting: { provider: "TBD", plan: "TBD", region: "TBD", url: "" },
    githubUrl: "",
    readmeUrl: "",
    demoVideoUrl: "",
    status: "draft",
    tier1: {
      readme5min: false,
      demoVideo60s: false,
      publicGithub: false,
      promptsVersioned: false,
      modelCallsLogged: false,
      toolOutputsValidated: false,
      retriesWithBackoff: false,
      secretsStripped: false,
      humanApprovalOnMoneyEmailDelete: false,
      streamingResponses: false,
      repeatQueriesCached: false,
      budgetCap: false,
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
