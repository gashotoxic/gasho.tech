import { ChevronDown } from "lucide-react"
import type { BidDraft } from "@/lib/tenders-shared"

/**
 * Expandable bid-draft sections for a top pick. Native `<details>` keeps this a server
 * component — no client JS, keyboard-accessible, works on any screen width.
 *
 * The draft is a starting page written from the tender notice, not a finished
 * submission, and the copy says so where the reader meets it.
 */
export default function BidDraftPanel({ draft }: { draft: BidDraft }) {
  const sections: Array<{ id: string; title: string; body: string; checklist?: boolean }> = [
    { id: "profile", title: "Company profile", body: draft.company_profile },
    { id: "mapping", title: "Capability mapping", body: draft.capability_mapping },
    { id: "compliance", title: "Compliance checklist", body: draft.compliance_checklist, checklist: true },
    { id: "pricing", title: "Pricing", body: draft.pricing },
  ]

  return (
    <div className="mt-4 space-y-2">
      {sections.map((section) => (
        <details key={section.id} className="group rounded-lg border border-border/50 bg-background/50">
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-[#1abc9c] list-none [&::-webkit-details-marker]:hidden">
            {section.title}
            <ChevronDown className="w-4 h-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4">
            {section.checklist ? (
              <ul className="space-y-1.5">
                {section.body
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => (
                    <li key={line} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span aria-hidden="true" className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#1abc9c]/60 shrink-0" />
                      {line}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">{section.body}</p>
            )}
          </div>
        </details>
      ))}
    </div>
  )
}
