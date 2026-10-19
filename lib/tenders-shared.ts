// Pure, browser-safe tender snapshot types + display helpers.
// MUST stay free of node:* imports — client components import from this module.
// The fs-backed loader lives in ./tenders (server-only).

export interface TenderScores {
  capability: number
  deadline_feasibility: number
  buyer_credibility: number
  value: number
  competition: number
}

export interface TenderRecord {
  rank: number
  title: string
  buyer: string
  category: string
  deadline: string // "YYYY-MM-DD HH:MM", East Africa Time
  scores: TenderScores
  total: number
  url: string
  source: string
}

export interface BidDraft {
  company_profile: string
  capability_mapping: string
  compliance_checklist: string
  pricing: string
}

export interface TopPick {
  rank: number
  title: string
  buyer: string
  deadline: string
  total: number
  url: string
  draft: BidDraft
}

export interface SourceHealth {
  source: string
  status: "ok" | "degraded" | "failed"
  records: number
  detail: string
}

export interface TendersSnapshot {
  schema_version: number
  generated_at: string // ISO8601 with offset
  generator: string
  run: {
    elapsed_seconds: number
    http_requests: number
    records_scored: number
    records_excluded: number
    budget_status: string
  }
  source_health: SourceHealth[]
  tenders: TenderRecord[]
  top_picks: TopPick[]
  totals: {
    active_tenders_seen: number
    scored: number
    top_picks: number
  }
}

export type SnapshotLoad =
  | { state: "ready"; snapshot: TendersSnapshot }
  | { state: "pending"; snapshot: null }

/* ── Display helpers (shared by server render and the client clock) ─────────────── */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "YYYY-MM-DD HH:MM" (EAT) → Date. Parsing is explicit so the display is
 *  timezone-independent regardless of where the page renders. */
export function parseDeadline(deadline: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(deadline.trim())
  if (!match) return null
  const [, y, mo, d, h, mi] = match
  // The deadline strings are East Africa Time wall-clock (UTC+3), fixed offset.
  return new Date(Date.UTC(+y, +mo - 1, +d, +h - 3, +mi))
}

/** "2026-10-23 10:00" → "23 Oct 2026, 10:00 EAT" */
export function formatDeadline(deadline: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(deadline.trim())
  if (!match) return deadline
  const [, y, mo, d, h, mi] = match
  return `${Number(d)} ${MONTHS_SHORT[Number(mo) - 1]} ${y}, ${h}:${mi} EAT`
}

/** Milliseconds between now and the deadline (negative = closed). */
export function deadlineMs(deadline: string, now: Date): number | null {
  const date = parseDeadline(deadline)
  return date ? date.getTime() - now.getTime() : null
}

export type DeadlineTone = "closed" | "urgent" | "soon" | "open"

/** Colour buckets for the days-left column: red ≤ 3 days, amber ≤ 7, green beyond. */
export function deadlineTone(deadline: string, now: Date): DeadlineTone {
  const ms = deadlineMs(deadline, now)
  if (ms === null) return "open"
  if (ms <= 0) return "closed"
  const days = ms / 86_400_000
  if (days <= 3) return "urgent"
  if (days <= 7) return "soon"
  return "open"
}

/** "4 days left" / "18h left" / "Closed" — what the table shows next to the date. */
export function deadlineLabel(deadline: string, now: Date): string {
  const ms = deadlineMs(deadline, now)
  if (ms === null) return ""
  if (ms <= 0) return "Closed"
  if (ms < 86_400_000) return `${Math.max(1, Math.round(ms / 3_600_000))}h left`
  return `${Math.ceil(ms / 86_400_000)} days left`
}

/** ISO timestamp → "19 Oct 2026, 07:30 EAT" — stable across server and client. */
export function formatGeneratedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  // Render in fixed UTC+3 (EAT) from the UTC fields so Node and browser agree.
  const eat = new Date(date.getTime() + 3 * 3_600_000)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${eat.getUTCDate()} ${MONTHS_SHORT[eat.getUTCMonth()]} ${eat.getUTCFullYear()}, ${pad(eat.getUTCHours())}:${pad(eat.getUTCMinutes())} EAT`
}
