#!/usr/bin/env node
/**
 * Build-artifact guard for the blog archive.
 *
 * `test/blogs-client-bundle.test.ts` walks the module graph, which catches the
 * import-chain leak class. It cannot see the *render* leak class: a server
 * component that reads the archive and passes draft posts as props to a client
 * component ships every draft body inside the RSC flight payload of a
 * prerendered page. No import edge exists, the unit suite stays green, and the
 * bodies are readable from the browser.
 *
 * This script closes that with the build output, which is the only thing that
 * can prove what a browser actually receives:
 *
 *  1. remove any previous build output (a stale `.next` was built from older
 *     source and can pass a scan the current source would fail),
 *  2. write a canary draft into data/blogs.json (a `published: false` post whose
 *     body carries a unique marker string),
 *  3. `npm run build`,
 *  4. grep everything a browser can fetch — `.next/static/**` and the
 *     prerendered `.html`/`.rsc` payloads under `.next/server/app/**` — for the
 *     marker,
 *  5. restore data/blogs.json (always, including on a failed build) and exit 1
 *     if the marker was found anywhere.
 *
 * `.next/server/chunks/**` is deliberately NOT scanned: server bundles embed the
 * archive by design, and grepping them would fail every build.
 *
 * Coverage limits, stated so nobody reads a green run as more than it is:
 * this proves what the BUILT output contains. Routes that render at request
 * time (`/blogs` and `/blogs/[slug]` are `force-dynamic`; the RSS/llms
 * handlers read the archive and render per request) never produce a scanned
 * file, so a leak that only appears at request time is not visible here. Those
 * surfaces are covered by their own tests (`test/feed.test.ts`,
 * `test/blogs-route.test.ts`) and by the `published === true` filter each of
 * them applies.
 *
 * Usage:
 *   node scripts/check-client-bundles.mjs              # full check (builds)
 *   node scripts/check-client-bundles.mjs --skip-build # scan an existing .next
 *   node scripts/check-client-bundles.mjs --next-dir /tmp/out --skip-build
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** The marker planted in the canary draft's body. Changing it is safe. */
export const CANARY_MARKER = "GASHOTECH-CANARY-CLIENT-BUNDLE-7f3c1a9d"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..")

/** File types a browser can fetch from `/_next/static`. */
const STATIC_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".json", ".txt", ".css", ".html", ".map"])

/**
 * Prerendered page output, RSC flight payloads and statically generated route
 * handler bodies (the render-leak surface).
 *
 * `.body` is the response body of a route handler that Next rendered at build
 * time — `sitemap.xml.body`, `robots.txt.body` and friends already exist in a
 * normal build, and a route handler that reads the archive and becomes static
 * would put every post body there.
 */
const PRERENDER_EXTENSIONS = [".html", ".rsc", ".rsc.txt", ".body"]

/** A draft post that must never reach a browser: `published: false` hides it. */
export function canaryPost(marker = CANARY_MARKER) {
  return {
    slug: "canary-client-bundle-guard",
    title: `Canary — build guard only (${marker})`,
    excerpt: `A draft used by scripts/check-client-bundles.mjs. Body marker: ${marker}`,
    content: `# Build guard canary\n\nThis draft must never be served to a browser.\n\n${marker}\n\n${marker}\n`,
    author: "Build Guard",
    category: "Technology",
    date: "1970-01-01",
    image: "/images/AI.webp",
    published: false,
  }
}

function walkFiles(dir, accept, into = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return into
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(full, accept, into)
    } else if (entry.isFile() && accept(full)) {
      into.push(full)
    }
  }
  return into
}

/**
 * Every artifact a browser can fetch from a build, and only those.
 *
 * Exported so the unit suite can prove the scanner fails on a known-leaky tree
 * and passes a clean one — a checker that cannot fail reports false confidence.
 */
export function scanArtifacts({ nextDir, marker = CANARY_MARKER }) {
  const staticDir = path.join(nextDir, "static")
  const appDir = path.join(nextDir, "server", "app")

  const files = [
    ...walkFiles(staticDir, (file) => STATIC_EXTENSIONS.has(path.extname(file))),
    ...walkFiles(appDir, (file) => PRERENDER_EXTENSIONS.some((extension) => file.endsWith(extension))),
  ]

  const offenders = []
  for (const file of files) {
    let contents
    try {
      contents = readFileSync(file, "utf8")
    } catch {
      continue
    }
    if (contents.includes(marker)) offenders.push(file)
  }

  return { scanned: files.length, offenders }
}

function parseArgs(argv) {
  const args = { skipBuild: false, nextDir: ".next", marker: CANARY_MARKER, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--skip-build") args.skipBuild = true
    else if (arg === "--next-dir") args.nextDir = argv[++i]
    else if (arg === "--marker") args.marker = argv[++i]
    else if (arg === "--help" || arg === "-h") args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

/**
 * A leftover backup means a previous run died between writing the canary and
 * restoring it (SIGKILL, a killed CI job). Recover before anything else: the
 * alternative is a canary draft committed to the archive by the next person who
 * runs `git add -A`.
 */
export function recoverLeftoverBackup(dataPath) {
  const backupPath = `${dataPath}.canary-backup`
  if (!existsSync(backupPath)) return false
  writeFileSync(dataPath, readFileSync(backupPath, "utf8"), "utf8")
  rmSync(backupPath, { force: true })
  return true
}

export function plantCanary(dataPath, marker) {
  const original = readFileSync(dataPath, "utf8")
  const backupPath = `${dataPath}.canary-backup`
  writeFileSync(backupPath, original, "utf8")

  const restore = () => {
    writeFileSync(dataPath, readFileSync(backupPath, "utf8"), "utf8")
    rmSync(backupPath, { force: true })
  }

  try {
    const parsed = JSON.parse(original)
    if (!Array.isArray(parsed.posts)) throw new Error(`${dataPath} has no posts array`)
    parsed.posts.push(canaryPost(marker))
    writeFileSync(dataPath, JSON.stringify(parsed, null, 2), "utf8")
  } catch (error) {
    // Never leave a half-written or un-backup-able archive behind: this throws
    // before `main` has anything to restore with.
    try {
      restore()
    } catch {
      // The backup file is still on disk; `recoverLeftoverBackup` handles it next run.
    }
    throw error
  }

  return { restore }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)

  if (args.help) {
    console.log(
      "Usage: node scripts/check-client-bundles.mjs [--skip-build] [--next-dir <dir>] [--marker <string>]"
    )
    return 0
  }

  const dataPath = path.join(REPO_ROOT, "data", "blogs.json")
  const nextDir = path.resolve(REPO_ROOT, args.nextDir)

  if (recoverLeftoverBackup(dataPath)) {
    console.log(`[canary] recovered data/blogs.json from a previous run's backup`)
  }

  let planted
  if (!args.skipBuild) {
    // A stale `.next` is worse than no build at all: it was produced by older
    // source, so a scan of it can pass while the current source leaks.
    rmSync(nextDir, { recursive: true, force: true })
    planted = plantCanary(dataPath, args.marker)
    console.log(`[canary] planted a draft post in ${path.relative(REPO_ROOT, dataPath)}`)
  }

  // Ctrl-C or a cancelled CI job during the multi-minute build must not leave the
  // canary draft in the archive for someone to commit.
  const restoreNow = () => {
    if (!planted) return false
    planted.restore()
    planted = null
    return true
  }
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      const restored = restoreNow()
      console.error(`[canary] interrupted by ${signal}${restored ? "; data/blogs.json restored" : ""}`)
      process.exit(130)
    })
  }

  try {
    if (!args.skipBuild) {
      console.log("[canary] building…")
      const npm = process.platform === "win32" ? "npm.cmd" : "npm"
      execFileSync(npm, ["run", "build"], { cwd: REPO_ROOT, stdio: "inherit" })
    }

    if (!existsSync(nextDir)) {
      console.error(`[canary] no build output at ${nextDir}`)
      return 2
    }

    const { scanned, offenders } = scanArtifacts({ nextDir, marker: args.marker })
    console.log(`[canary] scanned ${scanned} client-fetchable artifact(s) under ${nextDir}`)

    if (offenders.length > 0) {
      console.error("[canary] LEAK: the canary draft reached a client-fetchable artifact:")
      for (const offender of offenders) console.error(`  - ${offender}`)
      console.error(
        "[canary] A draft post must never be sent to a browser. Check for a server component passing"
      )
      console.error(
        "[canary] draft posts as props to a client component, or a component that imports the archive."
      )
      return 1
    }

    console.log("[canary] clean: no draft body in any client-fetchable artifact")
    return 0
  } finally {
    if (restoreNow()) {
      console.log(`[canary] restored ${path.relative(REPO_ROOT, dataPath)}`)
    }
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code ?? 0))
    .catch((error) => {
      console.error("[canary] failed:", error)
      process.exit(2)
    })
}
