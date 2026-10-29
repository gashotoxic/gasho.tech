/**
 * Resolve hook backing `alias-hook.mjs`.
 *
 * Two things the plain Node resolver cannot do here:
 *
 * 1. `@/<path>` — the tsconfig `paths` alias, used by every route and page.
 * 2. `next/server` — Next 16 publishes the subpath as `next/server.js` in its
 *    exports map; the bundler accepts the short form, bare Node does not.
 */
import { existsSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = pathToFileURL(`${process.cwd()}/`)
const SUFFIXES = ["", ".ts", ".tsx", ".js", ".json", "/index.ts", "/index.tsx"]
const BARE_ALIASES = new Map([["next/server", "next/server.js"]])

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = new URL(specifier.slice(2), ROOT)
    for (const suffix of SUFFIXES) {
      const candidate = new URL(`${base.href}${suffix}`)
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true }
      }
    }
  }

  const alias = BARE_ALIASES.get(specifier)
  if (alias) return nextResolve(alias, context)

  return nextResolve(specifier, context)
}
