// Server-only snapshot loader. Imports node:fs — NEVER import this module from a
// client component (use ./tenders-shared for types and display helpers).

import { readFileSync } from "node:fs"
import path from "node:path"

export * from "./tenders-shared"
import type { TendersSnapshot, SnapshotLoad } from "./tenders-shared"

const SNAPSHOT_PATH = path.join(process.cwd(), "data", "tenders-snapshot.json")

/** Missing file, unreadable file, invalid JSON and an empty tender list all resolve to
 *  the same friendly pending state — the page must never crash on absent data. */
export function loadTendersSnapshot(): SnapshotLoad {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"))
  } catch {
    return { state: "pending", snapshot: null }
  }
  if (!parsed || typeof parsed !== "object") return { state: "pending", snapshot: null }
  const snapshot = parsed as TendersSnapshot
  if (!Array.isArray(snapshot.tenders) || snapshot.tenders.length === 0) {
    return { state: "pending", snapshot: null }
  }
  return { state: "ready", snapshot }
}
