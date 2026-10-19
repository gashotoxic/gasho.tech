"use client"

import { useMemo, useState } from "react"
import { ExternalLink } from "lucide-react"
import type { TenderRecord } from "@/lib/tenders-shared"
import {
  deadlineLabel,
  deadlineTone,
  formatDeadline,
} from "@/lib/tenders-shared"
import type { DeadlineTone } from "@/lib/tenders-shared"

/* ── Filter vocabulary ─────────────────────────────────────────────────────────
   sector / buyer_level are produced by the tender-finder pipeline (optional in
   older snapshots — a missing field filters as 'other'). Sector = the DOMAIN of
   the work, not the contracting style: an ICT consultancy lands in ICT & Digital
   so a tech buyer sees their whole field in one tap. */

const SECTOR_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "ict-digital", label: "ICT & Digital" },
  { value: "consultancy", label: "Consultancy" },
  { value: "works-infrastructure", label: "Works & Infrastructure" },
  { value: "goods-supplies", label: "Goods & Supplies" },
  { value: "security-facility", label: "Security & Facility" },
  { value: "training-capacity", label: "Training & Capacity" },
  { value: "other", label: "Other" },
]

const BUYER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All levels" },
  { value: "national", label: "National government" },
  { value: "county", label: "County government" },
  { value: "ngcdf", label: "NG-CDF constituency" },
  { value: "state-corporation", label: "State corporation" },
  { value: "education", label: "Education sector" },
  { value: "other", label: "Other" },
]

const TONE_CLASSES: Record<DeadlineTone, string> = {
  closed: "text-red-600 dark:text-red-400",
  urgent: "text-red-600 dark:text-red-400",
  soon: "text-amber-600 dark:text-amber-400",
  open: "text-emerald-600 dark:text-emerald-400",
}

const SCORE_COLUMNS: Array<{ key: keyof TenderRecord["scores"]; short: string; full: string }> = [
  { key: "capability", short: "Cap", full: "Capability fit" },
  { key: "deadline_feasibility", short: "Dead", full: "Deadline feasibility" },
  { key: "buyer_credibility", short: "Buy", full: "Buyer credibility" },
  { key: "value", short: "Value", full: "Value attractiveness" },
  { key: "competition", short: "Comp", full: "Competition" },
]

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors " +
        (active
          ? "bg-[#1abc9c] text-white border-[#1abc9c]"
          : "bg-transparent text-muted-foreground border-border/60 hover:border-[#1abc9c]/60 hover:text-[#1abc9c]")
      }
    >
      {children}
    </button>
  )
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors " +
        (active
          ? "bg-[#1abc9c]/15 text-[#16a085] dark:text-[#1abc9c] border-[#1abc9c]/60"
          : "bg-transparent text-muted-foreground border-border/60 hover:border-[#1abc9c]/60")
      }
    >
      {children}
    </button>
  )
}

export default function TenderExplorer({
  tenders,
  referenceAt,
}: {
  tenders: TenderRecord[]
  referenceAt: string
}) {
  const refDate = useMemo(() => new Date(referenceAt), [referenceAt])
  const [sector, setSector] = useState("all")
  const [buyerLevel, setBuyerLevel] = useState("all")
  const [closingSoon, setClosingSoon] = useState(false)
  const [score12, setScore12] = useState(false)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tenders.filter((t) => {
      const tSector = t.sector ?? "other"
      const tBuyer = t.buyer_level ?? "other"
      if (sector !== "all" && tSector !== sector) return false
      if (buyerLevel !== "all" && tBuyer !== buyerLevel) return false
      if (score12 && t.total < 12) return false
      if (closingSoon) {
        const tone = deadlineTone(t.deadline, refDate)
        if (tone === "closed" || tone === "open") return false
      }
      if (q && !(`${t.title} ${t.buyer}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [tenders, sector, buyerLevel, closingSoon, score12, query, refDate])

  return (
    <div>
      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {SECTOR_OPTIONS.map((opt) => (
            <Chip key={opt.value} active={sector === opt.value} onClick={() => setSector(opt.value)}>
              {opt.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-muted-foreground">
            <span className="sr-only">Buyer level</span>
            <select
              value={buyerLevel}
              onChange={(e) => setBuyerLevel(e.target.value)}
              className="bg-transparent border border-border/60 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-[#1abc9c]"
            >
              {BUYER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <Toggle active={closingSoon} onClick={() => setClosingSoon(!closingSoon)}>
            Closing in 7 days
          </Toggle>
          <Toggle active={score12} onClick={() => setScore12(!score12)}>
            Score 12+
          </Toggle>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or buyer…"
            className="bg-transparent border border-border/60 rounded-lg px-3 py-1.5 text-xs text-foreground min-w-[180px] focus:outline-none focus:border-[#1abc9c]"
          />
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Showing {filtered.length} of {tenders.length} tenders
          {filtered.length === 0 && " — try clearing a filter"}
        </p>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-border/50 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Tender</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Deadline</th>
              {SCORE_COLUMNS.map((col) => (
                <th key={col.key} className="px-2 py-3 font-medium" title={col.full}>
                  {col.short}
                </th>
              ))}
              <th className="px-3 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tender) => {
              const tone = deadlineTone(tender.deadline, refDate)
              return (
                <tr
                  key={`${tender.rank}-${tender.url}`}
                  className="border-b border-border/30 last:border-0 align-top hover:bg-[#1abc9c]/5 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{tender.rank}</td>
                  <td className="px-4 py-3 max-w-[280px]">
                    <div className="text-sm font-medium leading-snug">{tender.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{tender.buyer}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{tender.category}</td>
                  <td className="px-4 py-3">
                    <div className="whitespace-nowrap">
                      <div className="text-sm">{formatDeadline(tender.deadline)}</div>
                      <div className={`text-xs ${TONE_CLASSES[tone]}`}>{deadlineLabel(tender.deadline, refDate)}</div>
                    </div>
                  </td>
                  {SCORE_COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className="px-2 py-3 text-xs text-muted-foreground/70 tabular-nums"
                      title={col.full}
                    >
                      {tender.scores[col.key]}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-sm font-semibold tabular-nums">{tender.total}</td>
                  <td className="px-4 py-3">
                    <a
                      href={tender.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#1abc9c] hover:text-[#16a085] text-sm font-medium transition-colors"
                    >
                      Open
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {tenders.length >= 50 && (
        <p className="text-xs text-muted-foreground mt-3">
          Showing the top 50 of this run — the full ranked report lives with the project.
        </p>
      )}
    </div>
  )
}
