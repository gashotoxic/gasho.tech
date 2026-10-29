import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { CANARY_MARKER, canaryPost, plantCanary, recoverLeftoverBackup, scanArtifacts } from "../scripts/check-client-bundles.mjs"

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

test("the scanner reads a statically rendered route-handler body", () => {
  // `.body` is a route handler Next rendered at build time (robots.txt,
  // sitemap.xml in the current build). A handler that read the archive and
  // became static would put every post body there, and the response is served
  // to anyone, so it belongs in the scanned set.
  withBuild({ "server/app/feed.xml.body": `<rss>${CANARY_MARKER}</rss>` }, (nextDir) => {
    const { scanned, offenders } = scanArtifacts({ nextDir })
    assert.equal(scanned, 1)
    assert.equal(offenders.length, 1)
    assert.match(offenders[0], /feed\.xml\.body$/)
  })
})

test("planting the canary is reversible, and a killed run is recovered", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "canary-archive-"))
  const dataPath = path.join(root, "blogs.json")
  const original = JSON.stringify({ posts: [{ slug: "real-post", published: true }] }, null, 2)
  writeFileSync(dataPath, original, "utf8")

  try {
    const planted = plantCanary(dataPath, CANARY_MARKER)
    assert.match(readFileSync(dataPath, "utf8"), new RegExp(CANARY_MARKER))
    planted.restore()
    assert.equal(readFileSync(dataPath, "utf8"), original, "restore must byte-for-byte revert")

    // A run that died between planting and restoring leaves the backup behind.
    const plantedAgain = plantCanary(dataPath, CANARY_MARKER)
    assert.ok(plantedAgain, "the second plant must succeed")
    assert.ok(existsSync(`${dataPath}.canary-backup`), "the backup is what recovery reads")
    assert.equal(recoverLeftoverBackup(dataPath), true)
    assert.equal(readFileSync(dataPath, "utf8"), original, "recovery must restore the archive")
    assert.equal(existsSync(`${dataPath}.canary-backup`), false, "the backup is consumed")

    // Nothing left to recover: the next run must not invent one.
    assert.equal(recoverLeftoverBackup(dataPath), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("the scanner is empty-clean on a build with no marker anywhere", () => {
  withBuild({ "static/chunks/app/page-abc.js": "self.__next_f.push([])" }, (nextDir) => {
    const { offenders } = scanArtifacts({ nextDir })
    assert.deepEqual(offenders, [])
  })
})
