"use client"

import { useEffect, useState } from "react"
import { formatGeneratedAt } from "@/lib/tenders-shared"

/**
 * "Last refreshed …" line with client-side relative time.
 *
 * Server render shows the absolute snapshot timestamp (deterministic), then the client
 * swaps in "12 minutes ago" once mounted and keeps it fresh every 30 seconds. Starting
 * from `null` keeps hydration clean.
 */
export default function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    const timestamp = new Date(iso).getTime()

    const tick = () => {
      if (Number.isNaN(timestamp)) {
        setLabel(null)
        return
      }
      const diff = Date.now() - timestamp
      const future = diff < 0
      const abs = Math.abs(diff)
      let text: string
      if (abs < 45_000) {
        text = "just now"
      } else if (abs < 3_600_000) {
        const mins = Math.round(abs / 60_000)
        text = future ? `in ${mins} minute${mins === 1 ? "" : "s"}` : `${mins} minute${mins === 1 ? "" : "s"} ago`
      } else if (abs < 86_400_000) {
        const hours = Math.round(abs / 3_600_000)
        text = future ? `in ${hours} hour${hours === 1 ? "" : "s"}` : `${hours} hour${hours === 1 ? "" : "s"} ago`
      } else {
        const days = Math.round(abs / 86_400_000)
        text = future ? `in ${days} day${days === 1 ? "" : "s"}` : `${days} day${days === 1 ? "" : "s"} ago`
      }
      setLabel(text)
    }

    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [iso])

  return (
    <p className="text-sm text-white/80">
      Last refreshed{" "}
      <time dateTime={iso} className="font-semibold text-white">
        {label ?? formatGeneratedAt(iso)}
      </time>
      <span className="text-white/60"> — refreshes every 3 hours</span>
    </p>
  )
}
