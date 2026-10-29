import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { latestPublishedPosts, type BlogPost } from "../lib/blogs.ts"

/**
 * The blog archive is 550 KB of JSON — every post body, drafts included — and it
 * used to be bundled into public client chunks. The mechanism was a plain import
 * chain: a `"use client"` component imported `lib/blogs`, which imported
 * `data/blogs.json`, so Turbopack inlined the whole archive into a chunk served
 * from `/_next/static/chunks/*.js` on `/` and `/blogs/admin`. No session needed.
 *
 * The build output is the real proof (grep `.next/static` for a draft body), but
 * a build check cannot run in the unit suite and cannot name the offending
 * import. These tests walk the module graph the bundler would walk and fail with
 * the chain, so a regression is caught before it ships.
 *
 * The walker is validated against synthetic in-memory graphs first: a checker
 * that cannot fail on a known-bad input proves nothing about the real tree.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url))
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"]
/** Code files only — used to find client entries (a JSON file has no directive). */
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]

/** Modules that must never appear in a client bundle. */
const SERVER_ONLY_TARGETS = [
  path.join(REPO_ROOT, "data", "blogs.json"),
  path.join(REPO_ROOT, "lib", "blogs-data.ts"),
]

const DATA_DIR = path.join(REPO_ROOT, "data")

/**
 * Beyond the two literal targets, guard the whole class: the blog archive by any
 * name, and any build-time content JSON under `data/` (all of it is server-side
 * content, none of it belongs in a client chunk).
 */
function isGuarded(file: string): boolean {
  if (SERVER_ONLY_TARGETS.includes(file)) return true
  const base = path.basename(file)
  if (base === "blogs-data.ts" || base === "blogs.json") return true
  return path.dirname(file) === DATA_DIR && base.endsWith(".json")
}

interface GraphIo {
  /** Resolve an import specifier to an absolute file path, or null if external. */
  resolve: (specifier: string, fromFile: string) => string | null
  read: (file: string) => string
}

function isClientModule(source: string): boolean {
  // The directive must open the file, but comments and blank lines may precede it.
  const withoutLeadingComments = source.replace(/^(?:\s+|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "")
  return /^["']use client["']/.test(withoutLeadingComments)
}

function importSpecifiers(source: string): string[] {
  const specifiers = new Set<string>()
  const patterns = [
    // static: `import x from "…"`, `export { x } from "…"`, `export * from "…"`
    /\bfrom\s*["']([^"']+)["']/g,
    // side-effect: `import "…"`
    /\bimport\s*["']([^"']+)["']/g,
    // dynamic: `import("…")`, `next/dynamic(() => import("…"))`, `import(\n "…"\n)`
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    // CommonJS
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ]
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source)) !== null) specifiers.add(match[1])
  }
  // Known limit: `import(someVariable)` and template-literal require() cannot be
  // resolved statically. Every realistic regression is a literal specifier; a
  // computed one is visible in review and in the `.next/static` build check.
  return [...specifiers]
}

/**
 * Everything reachable from `entry` — the same closure the bundler computes for
 * a client entry point.
 */
function reachableFrom(entry: string, io: GraphIo, into: Set<string> = new Set()): Set<string> {
  if (into.has(entry)) return into
  into.add(entry)

  let source: string
  try {
    source = io.read(entry)
  } catch {
    return into
  }

  for (const specifier of importSpecifiers(source)) {
    const resolved = io.resolve(specifier, entry)
    if (resolved) reachableFrom(resolved, io, into)
  }
  return into
}

function isSourceFile(file: string): boolean {
  // A JSON file can never be a client ENTRY; it is only ever reached as a target.
  return SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension))
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // `.hermes` and other dot dirs are agent state; `node_modules`/`.next` are
    // build output. Everything else is walked — a client entry can appear in a
    // directory that did not exist when this list was written.
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(full))
    else if (isSourceFile(full)) files.push(full)
  }
  return files
}

function resolveInRepo(specifier: string, fromFile: string): string | null {
  let base: string
  if (specifier.startsWith("@/")) base = path.join(REPO_ROOT, specifier.slice(2))
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier)
  else return null // bare package or node builtin — ships anyway, but not our archive

  const candidates = [
    base,
    ...EXTENSIONS.map((extension) => base + extension),
    ...EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const REPO_IO: GraphIo = {
  resolve: resolveInRepo,
  read: (file) => readFileSync(file, "utf-8"),
}

function clientEntries(): string[] {
  return sourceFiles(REPO_ROOT).filter((file) => isClientModule(readFileSync(file, "utf-8")))
}

function archiveHits(entry: string, io: GraphIo): string[] {
  return [...reachableFrom(entry, io)].filter((file) => isGuarded(file))
}

// --- the checker itself -----------------------------------------------------

test("the graph walker follows relative imports transitively", () => {
  const files: Record<string, string> = {
    "/x/client.tsx": '"use client"\nimport { a } from "./a"\nimport { c } from "./c"\nexport const b = a + c',
    "/x/a.ts": 'import data from "./data/blogs.json"\nexport const a = data',
    "/x/c.ts": "export const c = 1",
    "/x/data/blogs.json": '{"posts":[]}',
  }
  const resolveAgainst = (specifier: string, from: string) => {
    const base = path.resolve(path.dirname(from), specifier)
    for (const candidate of [base, ...EXTENSIONS.map((extension) => base + extension)]) {
      if (candidate in files) return candidate
    }
    return null
  }
  const io: GraphIo = {
    resolve: (specifier, from) => (specifier.startsWith(".") ? resolveAgainst(specifier, from) : null),
    read: (file) => {
      if (!(file in files)) throw new Error(`no such file: ${file}`)
      return files[file]
    },
  }

  const graph = reachableFrom("/x/client.tsx", io)
  assert.ok(graph.has("/x/a.ts"), "walker did not follow an extensionless relative import")
  assert.ok(graph.has("/x/data/blogs.json"), "walker missed a transitively imported JSON file")
})

test("the graph walker passes a clean client graph", () => {
  const files: Record<string, string> = {
    "/x/client.tsx": '"use client"\nimport type { T } from "./types"\nexport const b = 1',
    "/x/types.ts": "export type T = number",
  }
  const io: GraphIo = {
    resolve: (specifier, from) => {
      if (!specifier.startsWith(".")) return null
      const base = path.resolve(path.dirname(from), specifier)
      return base in files ? base : base + ".ts" in files ? base + ".ts" : null
    },
    read: (file) => {
      if (!(file in files)) throw new Error(`no such file: ${file}`)
      return files[file]
    },
  }

  assert.deepEqual([...reachableFrom("/x/client.tsx", io)], ["/x/client.tsx", "/x/types.ts"])
})

test("the graph walker follows a dynamic import", () => {
  const files: Record<string, string> = {
    "/x/client.tsx": '"use client"\nexport const load = () => import(\n  "./data/blogs.json"\n)',
    "/x/data/blogs.json": '{"posts":[]}',
  }
  const io: GraphIo = {
    resolve: (specifier, from) => {
      if (!specifier.startsWith(".")) return null
      const base = path.resolve(path.dirname(from), specifier)
      return base in files ? base : null
    },
    read: (file) => {
      if (!(file in files)) throw new Error(`no such file: ${file}`)
      return files[file]
    },
  }

  assert.deepEqual([...reachableFrom("/x/client.tsx", io)], ["/x/client.tsx", "/x/data/blogs.json"])
})

test("the graph walker resolves an extensionless import of a .json file", () => {
  const files: Record<string, string> = {
    "/x/client.tsx": '"use client"\nimport data from "./data/blogs"\nexport const d = data',
    "/x/data/blogs.json": '{"posts":[]}',
  }
  const io: GraphIo = {
    resolve: (specifier, from) => {
      if (!specifier.startsWith(".")) return null
      const base = path.resolve(path.dirname(from), specifier)
      for (const candidate of [base, ...EXTENSIONS.map((extension) => base + extension)]) {
        if (candidate in files) return candidate
      }
      return null
    },
    read: (file) => {
      if (!(file in files)) throw new Error(`no such file: ${file}`)
      return files[file]
    },
  }

  assert.ok(reachableFrom("/x/client.tsx", io).has("/x/data/blogs.json"))
})

test("isClientModule ignores leading comments but not the directive", () => {
  assert.ok(isClientModule('"use client"\nimport x from "y"'))
  assert.ok(isClientModule("/* licence */\n// note\n\n'use client'\nexport default 1"))
  assert.ok(!isClientModule('import x from "y"\nconst s = "use client"'))
})

// --- the real tree ----------------------------------------------------------

test("no client module reaches the blog archive (data/blogs.json)", () => {
  const entries = clientEntries()
  assert.ok(entries.length > 0, "no client modules found — the walker is looking in the wrong place")

  const offenders = entries
    .map((entry) => ({ entry, hits: archiveHits(entry, REPO_IO) }))
    .filter(({ hits }) => hits.length > 0)

  assert.deepEqual(
    offenders.map(
      ({ entry, hits }) =>
        `${path.relative(REPO_ROOT, entry)} → ${hits.map((hit) => path.relative(REPO_ROOT, hit)).join(", ")}`
    ),
    [],
    "a client component can reach the blog archive, so every post body (drafts included) lands in a public chunk"
  )
})

test("lib/blogs-data is resolvable, so the guard is not vacuous", () => {
  assert.ok(
    resolveInRepo("@/lib/blogs-data", path.join(REPO_ROOT, "app", "page.tsx")),
    "the server-only archive module moved or was renamed — update the guard targets"
  )
  assert.ok(
    resolveInRepo("@/data/blogs.json", path.join(REPO_ROOT, "app", "page.tsx")),
    "data/blogs.json moved — update the guard targets"
  )
  // The guard covers the class, not two literals: any content JSON under data/.
  assert.ok(isGuarded(path.join(REPO_ROOT, "data", "blogs.json")))
  assert.ok(isGuarded(path.join(REPO_ROOT, "data", "blogs-2027.json")))
  assert.ok(isGuarded(path.join(REPO_ROOT, "lib", "blogs-data.ts")))
  assert.ok(!isGuarded(path.join(REPO_ROOT, "lib", "blogs.ts")))
  assert.ok(!isGuarded(path.join(REPO_ROOT, "public", "manifest.json")))
})

test("the admin page loads the list from the API, not from the archive", () => {
  const admin = readFileSync(path.join(REPO_ROOT, "app", "blogs", "admin", "page.tsx"), "utf-8")

  assert.doesNotMatch(admin, /from\s*["']@\/lib\/blogs-data["']/)
  assert.doesNotMatch(admin, /from\s*["'][^"']*blogs\.json["']/)
  assert.match(admin, /fetch\(\s*["']\/api\/blogs["']/, "the admin list must come from GET /api/blogs")
  assert.match(admin, /Authorization/, "the list request must carry the admin session token")
})

test("components/sections/blogs.tsx stays a server component", () => {
  // The homepage preview strip renders the three latest published posts. While it
  // was a client component it had to import the archive, which put every post
  // body — drafts included — in a public chunk of `/`. Interactivity comes from
  // <FadeIn>, a client component a server component may render as a child, so
  // the directive is never needed here and adding one re-opens the whole leak.
  const section = readFileSync(path.join(REPO_ROOT, "components", "sections", "blogs.tsx"), "utf-8")

  assert.equal(
    isClientModule(section),
    false,
    "components/sections/blogs.tsx must not be a client component"
  )
  assert.doesNotMatch(
    section,
    /^\s*["']use client["']/m,
    "no 'use client' directive statement anywhere in components/sections/blogs.tsx"
  )
  assert.match(
    section,
    /\blatestPublishedPosts\b/,
    "the preview must filter to published posts, not slice the raw archive"
  )
})

// --- the helper the sections use -------------------------------------------
function post(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    slug: "a-post",
    title: "A post",
    excerpt: "An excerpt",
    content: "Body",
    author: "GashoTech",
    category: "AI",
    date: "2026-09-01",
    image: "/images/AI.webp",
    published: true,
    ...overrides,
  }
}

test("latestPublishedPosts keeps published posts only, newest first, capped", () => {
  const posts = [
    post({ slug: "old", date: "2026-01-01" }),
    post({ slug: "draft", date: "2026-12-31", published: false }),
    post({ slug: "newest", date: "2026-09-01" }),
    post({ slug: "middle", date: "2026-05-01" }),
  ]

  assert.deepEqual(
    latestPublishedPosts(posts, 3).map((p) => p.slug),
    ["newest", "middle", "old"]
  )
  assert.deepEqual(
    latestPublishedPosts(posts, 10).map((p) => p.slug),
    ["newest", "middle", "old"]
  )
  assert.deepEqual(latestPublishedPosts([], 3), [])
  // The caller's array is not reordered.
  assert.deepEqual(posts.map((p) => p.slug), ["old", "draft", "newest", "middle"])
})
