import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Radio } from "lucide-react"
import BidDraftPanel from "@/components/tenders/bid-draft"
import RelativeTime from "@/components/tenders/relative-time"
import {
  deadlineLabel,
  deadlineTone,
  formatDeadline,
  loadTendersSnapshot,
  type DeadlineTone,
  type SourceHealth,
  type TenderRecord,
  type TopPick,
} from "@/lib/tenders"

// The snapshot file is rewritten by the tender-finder pipeline every 3 hours; this page
// re-reads it at most every 30 minutes, so the table and days-left colours stay close
// to the truth without rebuilding the site.
export const revalidate = 1800

export const metadata: Metadata = {
  title: "Kenyan Tender Radar",
  description:
    "A ranked readout of the open tenders on Kenya's national procurement portal — scored on five plain axes, with a first-draft bid response for the top picks. Refreshed every 3 hours.",
  alternates: {
    canonical: "https://gashotech.com/tenders",
  },
  openGraph: {
    title: "Kenyan Tender Radar | GashoTech",
    description:
      "A ranked readout of the open tenders on Kenya's national procurement portal — scored on five plain axes, with a first-draft bid response for the top picks.",
    url: "https://gashotech.com/tenders",
    siteName: "GashoTech",
    locale: "en_KE",
    type: "website",
    images: [{ url: "https://gashotech.com/images/gashotech_logo.webp", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kenyan Tender Radar | GashoTech",
    description:
      "A ranked readout of the open tenders on Kenya's national procurement portal — scored on five plain axes, with a first-draft bid response for the top picks.",
    images: [{ url: "https://gashotech.com/images/gashotech_logo.webp" }],
  },
}

/* ── Small presentational helpers ─────────────────────────────────────────────── */

const TONE_CLASSES: Record<DeadlineTone, string> = {
  closed: "text-muted-foreground/70",
  urgent: "text-red-600 dark:text-red-400 font-semibold",
  soon: "text-amber-600 dark:text-amber-400 font-medium",
  open: "text-emerald-600 dark:text-emerald-400",
}

const SOURCE_STATUS_CLASSES: Record<SourceHealth["status"], string> = {
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  degraded: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400",
}

function DeadlineCell({ deadline, now }: { deadline: string; now: Date }) {
  const tone = deadlineTone(deadline, now)
  return (
    <div className="whitespace-nowrap">
      <div className="text-sm">{formatDeadline(deadline)}</div>
      <div className={`text-xs ${TONE_CLASSES[tone]}`}>{deadlineLabel(deadline, now)}</div>
    </div>
  )
}

const SCORE_COLUMNS: Array<{ key: keyof TenderRecord["scores"]; short: string; full: string }> = [
  { key: "capability", short: "Cap", full: "Capability fit" },
  { key: "deadline_feasibility", short: "Dead", full: "Deadline feasibility" },
  { key: "buyer_credibility", short: "Buy", full: "Buyer credibility" },
  { key: "value", short: "Value", full: "Value attractiveness" },
  { key: "competition", short: "Comp", full: "Competition" },
]

/* ── Page ─────────────────────────────────────────────────────────────────────── */

export default function TendersPage() {
  const { state, snapshot } = loadTendersSnapshot()
  const now = new Date()

  const topPicks: TopPick[] = state === "ready" ? snapshot.top_picks.slice(0, 3) : []
  const ranked: TenderRecord[] = state === "ready" ? snapshot.tenders.slice(0, 50) : []

  return (
    <div className="pt-16">
      {/* Hero */}
      <div className="jumbotron text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">Kenyan Tender Radar</h1>
        <p className="text-lg text-white/90 max-w-3xl mx-auto">
          Every open tender on Kenya&apos;s national procurement portal, scored on five plain
          axes and ranked — so a small bidding team spends its hours on the opportunities it
          can actually win, with a first-draft response ready for the top picks.
        </p>
        <div className="mt-4 flex justify-center">
          {state === "ready" && snapshot ? (
            <RelativeTime iso={snapshot.generated_at} />
          ) : (
            <p className="text-sm text-white/80">First refresh pending</p>
          )}
        </div>
        <div className="mt-6">
          <Link
            href="/projects/tender-rfq-finder"
            className="inline-flex items-center gap-2 text-white hover:text-[#094d3e] dark:hover:text-[#1abc9c] font-medium transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            About the Tender / RFQ Finder project
          </Link>
        </div>
      </div>

      {/* Section anchors */}
      <nav className="bg-white dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <a href="#top-picks" className="text-muted-foreground hover:text-[#1abc9c] transition-colors">Top picks</a>
          <a href="#ranked-tenders" className="text-muted-foreground hover:text-[#1abc9c] transition-colors">Ranked tenders</a>
          <a href="#source-health" className="text-muted-foreground hover:text-[#1abc9c] transition-colors">Source health</a>
          <a href="#how-it-works" className="text-muted-foreground hover:text-[#1abc9c] transition-colors">How it works</a>
          <a href="#scoring-rubric" className="text-muted-foreground hover:text-[#1abc9c] transition-colors">Scoring rubric</a>
          <a href="#faq" className="text-muted-foreground hover:text-[#1abc9c] transition-colors">FAQ</a>
        </div>
      </nav>

      <div className="bg-grey py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          {state === "pending" ? (
            /* ── First-refresh-pending state (missing snapshot file or empty run) ── */
            <div className="text-center bg-card border border-border/50 rounded-xl p-12 max-w-2xl mx-auto">
              <Radio className="w-8 h-8 text-[#1abc9c] mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-3">First refresh pending</h2>
              <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
                The radar runs every 3 hours against Kenya&apos;s national procurement portal.
                The ranked tenders, top picks and bid drafts appear here as soon as the first
                run finishes — the guide below explains exactly what you&apos;ll be looking at.
              </p>
              <a
                href="#how-it-works"
                className="inline-block mt-6 text-[#1abc9c] hover:text-[#16a085] font-medium transition-colors"
              >
                Read the guide &darr;
              </a>
            </div>
          ) : (
            <>
              {/* ── Top picks ─────────────────────────────────────────────────── */}
              <section id="top-picks" className="scroll-offset mb-14">
                <h2 className="text-2xl font-bold mb-2">Top picks</h2>
                <p className="text-muted-foreground mb-6 max-w-3xl leading-relaxed">
                  The three highest-scoring tenders in this run. Each one comes with a
                  first-draft bid response — open the sections to see the company profile,
                  capability mapping, compliance checklist and pricing placeholder.
                </p>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {topPicks.map((pick) => (
                    <article
                      key={pick.rank}
                      className="flex flex-col bg-card rounded-xl p-6 shadow-sm border border-border/50 hover:border-[#1abc9c]/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <span className="shrink-0 w-8 h-8 rounded-full bg-[#1abc9c]/15 text-[#1abc9c] flex items-center justify-center text-sm font-semibold">
                          {pick.rank}
                        </span>
                        <span className="shrink-0 rounded-full bg-[#1abc9c]/10 text-[#1abc9c] px-3 py-1 text-xs font-semibold">
                          {pick.total} / 25
                        </span>
                      </div>
                      <h3 className="font-semibold leading-snug mb-1">{pick.title}</h3>
                      <p className="text-sm text-muted-foreground mb-3">{pick.buyer}</p>
                      <div className="mb-4">
                        <DeadlineCell deadline={pick.deadline} now={now} />
                      </div>
                      <a
                        href={pick.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[#1abc9c] hover:text-[#16a085] font-medium text-sm transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Tender notice
                      </a>
                      <BidDraftPanel draft={pick.draft} />
                    </article>
                  ))}
                </div>
              </section>

              {/* ── Ranked table ──────────────────────────────────────────────── */}
              <section id="ranked-tenders" className="scroll-offset mb-14">
                <h2 className="text-2xl font-bold mb-2">Ranked tenders</h2>
                <p className="text-muted-foreground mb-6 max-w-3xl leading-relaxed">
                  Every scored tender in this run, ordered by total score. The five dim
                  columns are the individual axis scores (0–5 each); the deadline column
                  colours the time left — red within 3 days, amber within 7, green beyond.
                </p>
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
                      {ranked.map((tender) => (
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
                            <DeadlineCell deadline={tender.deadline} now={now} />
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
                      ))}
                    </tbody>
                  </table>
                </div>
                {ranked.length >= 50 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Showing the top 50 of this run — the full ranked report lives with the project.
                  </p>
                )}
              </section>

              {/* ── Source health strip ───────────────────────────────────────── */}
              <section id="source-health" className="scroll-offset mb-14">
                <h2 className="text-2xl font-bold mb-2">Source health</h2>
                <p className="text-muted-foreground mb-6 max-w-3xl leading-relaxed">
                  What this run actually saw while fetching. A degraded or failed source is
                  shown as-is — it means fewer records were scored from that stream, not that
                  the numbers were adjusted.
                </p>
                <div className="bg-card rounded-xl border border-border/50 shadow-sm p-5">
                  <div className="flex flex-wrap gap-3">
                    {snapshot.source_health.map((source) => (
                      <div
                        key={source.source}
                        className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold ${SOURCE_STATUS_CLASSES[source.status]}`}
                      >
                        <span className="capitalize">{source.status}</span>
                        <span className="font-normal opacity-90">{source.source}</span>
                        <span className="font-normal opacity-70">· {source.records} records</span>
                      </div>
                    ))}
                  </div>
                  <ul className="mt-4 space-y-1.5">
                    {snapshot.source_health.map((source) => (
                      <li key={`${source.source}-detail`} className="text-sm text-muted-foreground leading-relaxed">
                        <span className="font-medium text-foreground/80">{source.source}:</span> {source.detail}
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-5 pt-4 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground uppercase tracking-wide">Records scored</dt>
                      <dd className="font-semibold tabular-nums">{snapshot.run.records_scored}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground uppercase tracking-wide">Run elapsed</dt>
                      <dd className="font-semibold tabular-nums">{snapshot.run.elapsed_seconds}s</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground uppercase tracking-wide">HTTP requests</dt>
                      <dd className="font-semibold tabular-nums">{snapshot.run.http_requests}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground uppercase tracking-wide">Budget</dt>
                      <dd className="font-semibold">{snapshot.run.budget_status}</dd>
                    </div>
                  </dl>
                </div>
              </section>
            </>
          )}

          {/* ── User guide ──────────────────────────────────────────────────── */}
          <section id="how-it-works" className="scroll-offset mb-14">
            <h2 className="text-2xl font-bold mb-2">How the radar works</h2>
            <p className="text-muted-foreground mb-6 max-w-3xl leading-relaxed">
              Four steps, run end to end every 3 hours. The scoring is a deterministic
              rubric — the same tender input always gets the same scores.
            </p>
            <ol className="space-y-3">
              {[
                {
                  title: "Fetch",
                  body: "Each run pulls the open tender listings from Kenya's national public procurement portal (tenders.go.ke), where procuring entities — TSC, county governments, parastatals — are required to publish. When a feed is blocked, stale or failing, the run records that instead of papering over it.",
                },
                {
                  title: "Score",
                  body: "Every fetched tender is scored 0–5 on five axes: capability fit, deadline feasibility, buyer credibility, value attractiveness and competition. Deterministic rubric, no model in the scoring path — same input, same scores.",
                },
                {
                  title: "Rank",
                  body: "The five scores add up to a total out of 25, and the report orders every scored tender by that total, deadline-aware. The top of the list is where a small bidding team should start reading.",
                },
                {
                  title: "Draft",
                  body: "For the top picks, the tool writes a first-draft bid response — company profile, capability mapping to the tender's requirements, compliance checklist and a pricing placeholder. A starting page, not a finished submission.",
                },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-4 bg-card rounded-lg p-5 shadow-sm">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-[#1abc9c]/15 text-[#1abc9c] flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* ── Scoring rubric ──────────────────────────────────────────────── */}
          <section id="scoring-rubric" className="scroll-offset mb-14">
            <h2 className="text-2xl font-bold mb-2">The scoring rubric</h2>
            <p className="text-muted-foreground mb-6 max-w-3xl leading-relaxed">
              Five axes, each scored 0–5. The totals column in the table is the sum — 25 is
              the ceiling, and no axis is weighted more than another.
            </p>
            <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-x-auto">
              <table className="w-full min-w-[680px] text-left">
                <thead>
                  <tr className="border-b border-border/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Axis</th>
                    <th className="px-4 py-3 font-medium">What it measures</th>
                    <th className="px-4 py-3 font-medium">A 0 means</th>
                    <th className="px-4 py-3 font-medium">A 5 means</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {[
                    {
                      axis: "Capability fit",
                      measures: "How well the tender's requirements match what a bidder can plausibly deliver.",
                      zero: "The work sits outside any reasonable capability.",
                      five: "The requirements sit squarely in the wheelhouse.",
                    },
                    {
                      axis: "Deadline feasibility",
                      measures: "Time between the run and the submission deadline.",
                      zero: "The deadline has passed or is under 48 hours away.",
                      five: "Weeks of runway to prepare a proper response.",
                    },
                    {
                      axis: "Buyer credibility",
                      measures: "Whether the procuring entity is an established, verifiable buyer.",
                      zero: "The buyer can't be verified from public records.",
                      five: "An established entity with a public procurement history.",
                    },
                    {
                      axis: "Value attractiveness",
                      measures: "The size of the contract against the effort of bidding and delivering.",
                      zero: "Not worth the cost of preparing a bid.",
                      five: "Strong value for the effort involved.",
                    },
                    {
                      axis: "Competition",
                      measures: "How winnable the likely field looks, given the sector and lot size.",
                      zero: "A stacked field where an ordinary bidder is noise.",
                      five: "A thin field or SME-friendly lots worth entering.",
                    },
                  ].map((row) => (
                    <tr key={row.axis} className="border-b border-border/30 last:border-0 align-top">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{row.axis}</td>
                      <td className="px-4 py-3 text-muted-foreground leading-relaxed">{row.measures}</td>
                      <td className="px-4 py-3 text-muted-foreground leading-relaxed">{row.zero}</td>
                      <td className="px-4 py-3 text-muted-foreground leading-relaxed">{row.five}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Reading the columns ─────────────────────────────────────────── */}
          <section id="reading-the-scores" className="scroll-offset mb-14">
            <h2 className="text-2xl font-bold mb-2">What each score column tells a bidder</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  title: "Rank",
                  body: "Position by total score, deadline-aware. Read from the top — but let the deadline column veto: a perfect score is worthless after submissions close.",
                },
                {
                  title: "Cap / Dead / Buy / Value / Comp",
                  body: "The five axis scores, kept dim on purpose. Scan them before opening a tender: a high total built on five middling 4s reads very differently from one with a 5 where it matters to your business.",
                },
                {
                  title: "Total",
                  body: "The sum of the five axes, out of 25. It's the sort key and a comparison aid — not a promise. Two tenders with the same total can demand very different bids.",
                },
                {
                  title: "Deadline (days left)",
                  body: "The colour is the message: red within 3 days, amber within 7, green beyond. If the days-left figure is red and your compliance documents aren't ready, that tender is a next-run problem, not a today problem.",
                },
                {
                  title: "Source link",
                  body: "The original tender notice on the public portal, every time. The scores here are a triage layer; the notice is the authority. Always open it and read the actual requirements before spending a bid on it.",
                },
              ].map((item) => (
                <div key={item.title} className="bg-card rounded-lg p-5 shadow-sm">
                  <h3 className="font-semibold text-[#1abc9c] mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Bid drafts ──────────────────────────────────────────────────── */}
          <section id="bid-drafts-guide" className="scroll-offset mb-14">
            <h2 className="text-2xl font-bold mb-2">What the bid drafts give you</h2>
            <p className="text-muted-foreground mb-6 max-w-3xl leading-relaxed">
              Each top pick ships with four draft blocks, written from the tender notice
              itself. They are a first page — everything in them must be checked against the
              real tender documents before it goes anywhere near a submission.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  title: "Company profile",
                  body: "A short, editable paragraph positioning a business for this specific tender — what to say about yourself when the form asks who you are.",
                },
                {
                  title: "Capability mapping",
                  body: "Requirement by requirement, what to point at in your own operation: which team, which partner, which past delivery answers each clause.",
                },
                {
                  title: "Compliance checklist",
                  body: "The documents and registrations the notice asks for — tax compliance, registrations, bid security, samples — listed so nothing is discovered the night before the deadline.",
                },
                {
                  title: "Pricing placeholder",
                  body: "Where the numbers go and how to structure the pricing schedule against the tender's bill of quantities. It is deliberately a placeholder — your costs and margins are yours to set.",
                },
              ].map((item) => (
                <div key={item.title} className="bg-card rounded-lg p-5 shadow-sm">
                  <h3 className="font-semibold text-[#1abc9c] mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── FAQ ─────────────────────────────────────────────────────────── */}
          <section id="faq" className="scroll-offset mb-10">
            <h2 className="text-2xl font-bold mb-6">FAQ</h2>
            <div className="space-y-3">
              {[
                {
                  q: "How often is this refreshed?",
                  a: "Every 3 hours. The 'Last refreshed' line at the top shows when the most recent run finished, and the days-left figures recalculate against the current time.",
                },
                {
                  q: "Where does the data come from?",
                  a: "Kenya's national public procurement portal (the Public Procurement Information Portal at tenders.go.ke) — the official noticeboard where public procuring entities publish their tenders. The source link on every row goes back to the original notice.",
                },
                {
                  q: "Is it free?",
                  a: "Yes. This dashboard is free to read, and the tender notices it links to are public documents.",
                },
                {
                  q: "How do I act on a tender?",
                  a: "Open the source link, download the actual tender documents from the portal, prepare your response against what those documents ask for, and submit through the portal before the deadline — portal registration is required to submit, so sort that out before a deadline is near. The scores and drafts here are preparation; the portal is where the bid happens.",
                },
              ].map((item) => (
                <details key={item.q} className="group bg-card rounded-lg shadow-sm border border-border/50">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 font-medium list-none [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span aria-hidden="true" className="text-[#1abc9c] transition-transform group-open:rotate-45 text-xl leading-none">+</span>
                  </summary>
                  <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* Back links */}
          <section className="text-center py-6 border-t border-gray-200 dark:border-gray-800 mt-8">
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/projects/tender-rfq-finder"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-[#1abc9c] transition-colors font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                About the Tender / RFQ Finder
              </Link>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-[#1abc9c] transition-colors font-medium"
              >
                All Projects
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
