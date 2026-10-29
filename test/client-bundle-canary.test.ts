import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { CANARY_MARKER, canaryPost, scanArtifacts } from "../scripts/check-client-bundles.mjs"

/**
 * The scanner behind `scripts/check-client-bundles.mjs` is the only guard that
 * can see the *render* leak class: a server component handing draft posts to a
 * client component ships every draft body in the RSC payload of a prerendered
 * page, with no import edge for the graph walker to follow.
 *
 * A scanner is only worth having if it fails on a known-leaky tree, so these
 * tests run it against synthetic build outputs before trusting it: a leak in
 * `.next/static`, a leak in a prerendered `.html`/`.rsc` payload, and the
 * negative case (server chunks legitimately embed the archive and must not be
 * reported).
 */

/** Build a throwaway `.next` tree from `{ relativePath: contents }`. */
function fakeBuild(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "canary-build-"))
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(root, relative)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, contents, "utf8")
  }
  return root
}

function withBuild<T>(files: Record<string, string>, run: (nextDir: string) => T): T {
  const root = fakeBuild(files)
  try {
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test("the canary is a hidden draft that carries the marker", () => {
  const post = canaryPost()
  assert.equal(post.published, false, "the canary must be a draft: a published post may legally ship")
  assert.ok(post.content.includes(CANARY_MARKER), "the canary body must carry the marker")
  assert.ok(post.slug.length > 0)
})

test("the scanner fails a leak in a client chunk", () => {
  withBuild(
    {
      "static/chunks/app/page-abc.js": `self.__next_f.push("${CANARY_MARKER}")`,
      "static/css/app.css": "body{}",
    },
    (nextDir) => {
      const { scanned, offenders } = scanArtifacts({ nextDir })
      assert.equal(scanned, 2, "both files should be scanned")
      assert.equal(offenders.length, 1)
      assert.match(offenders[0], /page-abc\.js$/)
    }
  )
})

test("the scanner fails a leak in a prerendered RSC payload and HTML", () => {
  withBuild(
    {
      "server/app/index.html": `<script>self.__next_f.push("${CANARY_MARKER}")</script>`,
      "server/app/index.rsc": `1:["$","$L1",null,{"posts":["${CANARY_MARKER}"]}]`,
    },
    (nextDir) => {
      const { offenders } = scanArtifacts({ nextDir })
      assert.equal(offenders.length, 2, "both the HTML and the flight payload are public")
    }
  )
})

test("the scanner does not report server chunks, which embed the archive by design", () => {
  withBuild(
    {
      "server/chunks/blogs-data.js": `const posts = [{"content":"${CANARY_MARKER}"}]`,
      "static/chunks/app/page-abc.js": "self.__next_f.push([])",
    },
    (nextDir) => {
      const { scanned, offenders } = scanArtifacts({ nextDir })
      assert.equal(scanned, 1, "only the static chunk is client-fetchable")
      assert.deepEqual(offenders, [])
    }
  )
})

test("the scanner ignores extensions a browser cannot execute", () => {
  withBuild({ "static/media/archive.wasm": CANARY_MARKER }, (nextDir) => {
    const { scanned, offenders } = scanArtifacts({ nextDir })
    assert.equal(scanned, 0)
    assert.deepEqual(offenders, [])
  })
})

test("the scanner is empty-clean on a build with no marker anywhere", () => {
  withBuild({ "static/chunks/app/page-abc.js": "self.__next_f.push([])" }, (nextDir) => {
    const { offenders } = scanArtifacts({ nextDir })
    assert.deepEqual(offenders, [])
  })
})
