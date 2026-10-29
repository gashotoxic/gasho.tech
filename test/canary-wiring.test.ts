import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { CANARY_MARKER, main } from "../scripts/check-client-bundles.mjs"

/**
 * The canary's *exit wiring*: `main()` returns 0 / 1 / 2 and the CLI wrapper
 * turns that into the process exit status. CI reads only the exit status, so a
 * script that scans correctly but exits 0 on a leak (or 0 on "no build output")
 * is a guard that silently stopped guarding.
 *
 * `test/client-bundle-canary.test.ts` tests the scanner. This tests the two
 * things it cannot: the codes `main()` returns, and that the `.then(code =>
 * process.exit(code))` wiring actually reaches the shell. Each case runs against
 * a throwaway build tree, so nothing here touches `.next` or the archive.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url))
const SCRIPT = path.join(REPO_ROOT, "scripts", "check-client-bundles.mjs")

function buildTree(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "canary-wiring-"))
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(root, relative)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, contents, "utf8")
  }
  return root
}

function withBuild<T>(files: Record<string, string>, run: (dir: string) => T): T {
  const dir = buildTree(files)
  try {
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Run the CLI exactly as CI does and return its exit status. */
function exitStatusFor(nextDir: string): number | null {
  const result = spawnSync(process.execPath, [SCRIPT, "--skip-build", "--next-dir", nextDir], {
    encoding: "utf8",
  })
  assert.equal(result.error, undefined, `could not spawn the canary: ${result.error}`)
  assert.notEqual(result.status, null, "the canary was killed by a signal instead of exiting")
  return result.status
}

test("main() returns 0 for a clean build tree", () =>
  withBuild({ "static/chunks/app/page-abc.js": "self.__next_f.push('nothing to see')" }, async (dir) => {
    assert.equal(await main(["--skip-build", "--next-dir", dir]), 0)
  }))

test("main() returns 1 when the canary marker reached a client artifact", () =>
  withBuild(
    { "static/chunks/app/page-abc.js": `self.__next_f.push("${CANARY_MARKER}")` },
    async (dir) => {
      assert.equal(await main(["--skip-build", "--next-dir", dir]), 1)
    }
  ))

test("main() returns 2 when there is no build output to scan", () => {
  const missing = path.join(os.tmpdir(), `canary-missing-${process.pid}-${Date.now()}`)
  return main(["--skip-build", "--next-dir", missing]).then((code) => {
    assert.equal(code, 2, "a missing build directory must not read as success")
  })
})

test("--help exits 0 without needing a build", async () => {
  assert.equal(await main(["--help"]), 0)
})

test("the CLI exits 0 for a clean tree", () => {
  withBuild({ "static/chunks/app/page-abc.js": "self.__next_f.push('clean')" }, (dir) => {
    assert.equal(exitStatusFor(dir), 0)
  })
})

test("the CLI exits 1 for a leaking tree, so CI fails the job", () => {
  withBuild({ "server/app/page.html": `<script>${CANARY_MARKER}</script>` }, (dir) => {
    assert.equal(exitStatusFor(dir), 1)
  })
})

test("the CLI exits 2 when the build directory is missing", () => {
  const missing = path.join(os.tmpdir(), `canary-missing-${process.pid}-${Date.now()}-cli`)
  assert.equal(exitStatusFor(missing), 2)
})
