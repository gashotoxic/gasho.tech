/**
 * Projects showcase data — Kenya Projects Pipeline (Phase 1).
 *
 * Spec: ~/.hermes/SHARED/kenya-projects-pipeline-spec.md (§3.2 data model, §6 Tier 1, §7 flagship)
 * Answer key: ~/.hermes/SHARED/kenya-projects-pipeline-answer-key.md
 *
 * Hard rules encoded here (not by convention):
 * - `projects` is typed as `Project[]`, so a missing required field fails `npm run build`.
 * - A project renders as **live** only when `status === "live"` AND every `tier1` value is
 *   `true`. Enforced by `isLiveProject()` — see the code gate below.
 * - Entries with `status: "draft"` are hidden from the grid, the sitemap and the detail
 *   route (`isPublicProject()` / `liveProjects()`).
 *
 * Tier 1 flags are set from VERIFIED evidence, never from intent. If a check cannot be
 * demonstrated, it is `false` even when the platform "probably" does it — the gate exists
 * to keep unverified claims out of the showcase. `tier1Notes` records which checks are
 * failed vs merely unverified, so the detail page can say so instead of showing a bare X.
 */

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

/** Human-readable label for each Tier 1 check, used on the detail page checklist. */
export const TIER1_LABELS: Record<Tier1Check, string> = {
  readme5min: "README explains the architecture in ≤ 5 minutes",
  demoVideo60s: "60-second demo video recorded",
  publicGithub: "Public GitHub repository",
  promptsVersioned: "Prompts versioned",
  modelCallsLogged: "Every model call logged",
  toolOutputsValidated: "Tool outputs schema-validated",
  retriesWithBackoff: "Retries with backoff",
  secretsStripped: "Secrets / PII stripped before the model",
  humanApprovalOnMoneyEmailDelete: "Human approval on money, email and delete actions",
  streamingResponses: "Streaming responses",
  repeatQueriesCached: "Repeat queries cached",
  budgetCap: "Token / time / cost budget cap",
};

export interface Project {
  slug: string; // url-safe, immutable once published
  title: string;
  tagline: string; // ≤ 120 chars
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
  status: "draft" | "preview" | "live";
  tier1: Record<Tier1Check, boolean>; // gate: all true required to render "live"
  /**
   * Optional per-check note. Only set for checks that are `false`, and only to say WHY —
   * "missing" (does not exist yet) vs "unverified" (exists but not demonstrated). Never
   * set a note for a check marked `true`: a passing check needs evidence, not prose.
   */
  tier1Notes?: Partial<Record<Tier1Check, string>>;
  publishedAt?: string; // ISO date
  metrics?: { costPerTask?: string; uptime?: string };
}

// ---------------------------------------------------------------------------
// Code gate — spec §3.2 / §6
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
export function effectiveStatus(project: Project): "draft" | "preview" | "live" {
  if (project.status === "draft") return "draft";
  return isLiveProject(project) ? "live" : "preview";
}

/** Visible in the public grid / detail route. Drafts are hidden everywhere. */
export function isPublicProject(project: Project): boolean {
  return project.status !== "draft";
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export const projects: Project[] = [
  /**
   * Flagship — decided by @user 2026-10-06 (spec §7): the GT-ASSIST-V2 platform itself.
   * Ships as `"preview"` on purpose. Six of the twelve Tier 1 checks are still outstanding,
   * so the gate keeps it out of the sitemap and off the "Live" badge until they clear.
   *
   * ⚠ `secretsStripped` is FALSE on verified evidence, not caution: the public build currently
   * exposes a client-side secret. Spec §7 maps this check to "✓"; that mapping is wrong.
   * Remediation (secret rotation + removing the secret from the client path) is tracked in
   * ~/.hermes/TODO.md 2026-10-06. Keep published copy at category level — never name the
   * exact wiring or the exposure mechanism.
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
    readmeUrl: "",
    demoVideoUrl: "",
    status: "preview",
    tier1: {
      readme5min: false, // README exists but has no architecture section yet, and it is not public
      demoVideo60s: false, // not recorded
      publicGithub: false, // repo private pending user call + secret sweep
      promptsVersioned: true, // model/prompt configs versioned in repo
      modelCallsLogged: false, // not demonstrated
      toolOutputsValidated: false, // not demonstrated
      retriesWithBackoff: true, // standard retry with backoff on transient provider errors
      secretsStripped: false, // VERIFIED FAIL — a secret is exposed in the public client bundle
      humanApprovalOnMoneyEmailDelete: true, // payment checkout confirmed by the customer
      streamingResponses: true, // replies stream back token by token
      repeatQueriesCached: false, // not demonstrated
      budgetCap: true, // unified credit system, free daily allowance + paid packs
    },
    tier1Notes: {
      readme5min: "Missing — README has no architecture section yet.",
      demoVideo60s: "Missing — 60-second walkthrough not recorded.",
      publicGithub: "Missing — repo is private pending a user call and a secret sweep.",
      modelCallsLogged: "Unverified — no per-call log surfaced yet.",
      toolOutputsValidated: "Unverified — tool output schemas not demonstrated.",
      secretsStripped:
        "FAILING — the public build exposes a client-side secret. Remediation is underway; this check must pass before the project can be presented as live.",
      repeatQueriesCached: "Unverified — no repeat-query cache demonstrated.",
    },
    publishedAt: "2026-10-06",
  },

  /**
   * Queued project #2 (spec §7): Tender / RFQ Finder + Bid Drafter.
   *
   * Placeholder only, and deliberately `status: "draft"`:
   * - it is NOT queued for a build here — it enters through the Phase 2 researcher backlog and
   *   gets rubric-scored like every other idea, so this entry gets replaced by the researcher's
   *   output when that lands;
   * - keeping one real draft entry means the draft-hiding rule (hidden from the grid, the
   *   sitemap and the detail route) is demonstrable against production data, not just asserted.
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

export function getProject(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}

/** Non-draft projects, newest first — what the grid renders. */
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
