import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * `handleLogout` must drop the archive it is holding, not just the token.
 *
 * `/blogs/admin` keeps the full post list — every body, drafts included — in
 * React state, because the panel edits bodies in place. Clearing only the token
 * left that array resident until the tab was reloaded, which on a shared browser
 * means the next person at the keyboard can read every draft in memory even
 * though the session is gone.
 *
 * There is no React test harness in this repo (no jsdom, no testing-library), so
 * this is a structural guard on the handler's source: it asserts the resets are
 * present, and validates itself against a known-bad handler first so a broken
 * extractor cannot quietly pass everything.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url))
const ADMIN_PAGE = path.join(REPO_ROOT, "app", "blogs", "admin", "page.tsx")

/** Calls that must appear in `handleLogout`: session *and* archive go away. */
const REQUIRED_RESETS = ["clearAdminToken()", "setToken(null)", "setPosts([])", 'setPassword("")']

/**
 * Extract a function body from source by brace matching, starting at the first
 * `{` after the `=>` of `<name> = (...) => {`.
 */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = `)
  assert.notEqual(start, -1, `could not find a \`const ${name} = ...\` declaration`)

  const arrow = source.indexOf("=>", start)
  assert.notEqual(arrow, -1, `\`${name}\` is not an arrow function`)

  const open = source.indexOf("{", arrow)
  assert.notEqual(open, -1, `\`${name}\` has no block body`)

  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    const char = source[i]
    if (char === "{") depth += 1
    else if (char === "}") {
      depth -= 1
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  assert.fail(`\`${name}\` body is not balanced`)
}

/** Which of the required resets are missing from a handler body. */
function missingResets(body: string): string[] {
  return REQUIRED_RESETS.filter((call) => !body.includes(call))
}

test("the extractor and checker fail on a handler that only clears the token", () => {
  // Self-validation: the previous (buggy) implementation, verbatim.
  const buggy = `
  const handleLogout = () => {
    clearAdminToken()
    setToken(null)
    setPassword("")
  }
  `
  const body = functionBody(buggy, "handleLogout")
  assert.deepEqual(missingResets(body), ["setPosts([])"], "the checker cannot see the missing reset")
})

test("handleLogout clears the archive as well as the session", () => {
  const source = readFileSync(ADMIN_PAGE, "utf-8")
  const body = functionBody(source, "handleLogout")

  assert.deepEqual(
    missingResets(body),
    [],
    `handleLogout must clear the session AND the post list; missing: ${missingResets(body).join(", ")}`
  )
})

test("the post list really does live in state (so the reset above is not vacuous)", () => {
  const source = readFileSync(ADMIN_PAGE, "utf-8")
  assert.match(source, /const \[posts, setPosts\] = useState<BlogPost\[\]>\(\[\]\)/)
})
