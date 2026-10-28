import { test } from "node:test"
import assert from "node:assert/strict"

import {
  CARD_LINK_KINDS,
  PROJECT_LINK_KINDS,
  TIER1_CHECKS,
  isRenderableUrl,
  projectLinks,
  projects,
  type Project,
} from "../data/projects.ts"

/**
 * The demo-link fallback rule (user directive 2026-10-28), proven against fixtures and then
 * against the real shipped data.
 *
 * The rule has three parts: a link renders only when its field holds a real absolute
 * http(s) URL; missing links are ABSENT (no empty button, no dead href); and the order is
 * live demo → video demo → GitHub, so a project that is not hosted shows its explainer video
 * in the same place while one that is hosted shows both, live first.
 */

const EMPTY_TIER1 = Object.fromEntries(TIER1_CHECKS.map((check) => [check, false])) as Record<
  (typeof TIER1_CHECKS)[number],
  boolean
>

/** A minimal preview entry — the projection is what is under test, not the Tier 1 gate. */
function fixture(fields: {
  liveUrl?: string
  demoVideoUrl?: string
  githubUrl?: string
  readmeUrl?: string
  hostingUrl?: string
  title?: string
  linkLabels?: Partial<Record<"live" | "video" | "repo" | "readme" | "hosting", string>>
} = {}): Project {
  return {
    slug: "fixture",
    title: fields.title ?? "Fixture Project",
    tagline: "fixture",
    problem: "fixture",
    workflow: "1. one step",
    agentArchitecture: { models: [], tools: [], memory: "n/a", routing: "n/a" },
    liveUrl: fields.liveUrl ?? "",
    hosting: { provider: "n/a", plan: "n/a", region: "n/a", url: fields.hostingUrl ?? "" },
    githubUrl: fields.githubUrl ?? "",
    readmeUrl: fields.readmeUrl ?? "",
    demoVideoUrl: fields.demoVideoUrl ?? "",
    linkLabels: fields.linkLabels,
    status: "preview",
    tier1: { ...EMPTY_TIER1 },
  }
}

const LIVE = "https://demo.example.com"
const VIDEO = "https://youtu.be/explainer"
const REPO = "https://github.com/gashotoxic/example"

test("hosted project with a video and a public repo renders live first, then video, then repo", () => {
  const links = projectLinks(
    fixture({ liveUrl: LIVE, demoVideoUrl: VIDEO, githubUrl: REPO, readmeUrl: `${REPO}/blob/main/README.md` }),
    CARD_LINK_KINDS,
  )

  assert.deepEqual(
    links.map((link) => link.kind),
    ["live", "video", "repo"],
  )
  assert.deepEqual(
    links.map((link) => link.href),
    [LIVE, VIDEO, REPO],
  )
  assert.deepEqual(
    links.map((link) => link.label),
    ["Live demo", "Video demo", "GitHub"],
  )
})

test("unhosted project shows the video demo in the live demo's place", () => {
  const links = projectLinks(fixture({ demoVideoUrl: VIDEO }), CARD_LINK_KINDS)
  assert.equal(links.length, 1)
  assert.equal(links[0].kind, "video")
  assert.equal(links[0].href, VIDEO)
})

test("a public repo alone renders exactly one link", () => {
  const links = projectLinks(fixture({ githubUrl: REPO }), CARD_LINK_KINDS)
  assert.equal(links.length, 1)
  assert.equal(links[0].kind, "repo")
})

test("a project with no links renders nothing at all — no empty button, no dead href", () => {
  assert.deepEqual(projectLinks(fixture(), CARD_LINK_KINDS), [])
  assert.deepEqual(projectLinks(fixture()), [])
})

test("the card shows the three demo links only; the detail page shows all five", () => {
  const project = fixture({
    liveUrl: LIVE,
    demoVideoUrl: VIDEO,
    githubUrl: REPO,
    readmeUrl: "https://github.com/gashotoxic/example#architecture",
    hostingUrl: "https://vercel.com/dashboard/example",
  })
  assert.deepEqual(
    projectLinks(project, CARD_LINK_KINDS).map((link) => link.kind),
    ["live", "video", "repo"],
  )
  assert.deepEqual(
    projectLinks(project).map((link) => link.kind),
    ["live", "video", "repo", "readme", "hosting"],
  )
})

test("placeholders are not links: empty, whitespace, n/a, TODO, bare path, javascript:", () => {
  const notUrls = [
    "",
    "   ",
    "n/a",
    "N/A",
    "TODO",
    "https://",
    "http://",
    "/tenders",
    "www.example.com",
    "example.com",
    "javascript:alert(1)",
    " https://demo.example.com with a space ",
  ]
  for (const value of notUrls) {
    assert.equal(isRenderableUrl(value), false, `${JSON.stringify(value)} must not be renderable`)
    assert.deepEqual(projectLinks(fixture({ liveUrl: value }), CARD_LINK_KINDS), [], `${JSON.stringify(value)} must render nothing`)
  }
})

test("surrounding whitespace is trimmed, not rendered", () => {
  const links = projectLinks(fixture({ liveUrl: `  ${LIVE}  ` }), CARD_LINK_KINDS)
  assert.equal(links.length, 1)
  assert.equal(links[0].href, LIVE)
})

test("hostile URL shapes are refused: credentials, angle brackets, quotes, bidi controls", () => {
  const hostile = [
    "https://user:pass@example.com",
    "https://a.b/</script><script>alert(1)</script>",
    'https://a.b/"onmouseover="x',
    "https://example.com/‮gnp.exe",
  ]
  for (const value of hostile) {
    assert.equal(isRenderableUrl(value), false, `${JSON.stringify(value)} must be refused`)
    assert.deepEqual(projectLinks(fixture({ liveUrl: value }), CARD_LINK_KINDS), [])
  }
})

test("two slots pointing at the same page collapse to one link", () => {
  const links = projectLinks(fixture({ liveUrl: LIVE, hostingUrl: LIVE }))
  assert.equal(links.length, 1)
  assert.equal(links[0].kind, "live")
})

test("every rendered link carries an accessible name naming the project and the new tab", () => {
  const links = projectLinks(
    fixture({ liveUrl: LIVE, demoVideoUrl: VIDEO, githubUrl: REPO, title: "Fixture Project" }),
  )
  assert.equal(links.length, 3)
  for (const link of links) {
    assert.match(link.href, /^https?:\/\//, `${link.kind} href must be absolute http(s)`)
    assert.match(link.ariaLabel, /Fixture Project/, `${link.kind} aria-label must name the project`)
    assert.match(link.ariaLabel, /new tab/, `${link.kind} aria-label must say it opens a new tab`)
    assert.ok(link.label.trim().length > 0, `${link.kind} must have visible text`)
  }
})

test("the shipped data never produces a non-http(s) href, and every card link is ordered", () => {
  const order = new Map(PROJECT_LINK_KINDS.map((kind, index) => [kind, index]))
  for (const project of projects) {
    for (const link of projectLinks(project)) {
      assert.match(link.href, /^https?:\/\/\S+$/, `${project.slug}:${link.kind} must be a real URL`)
    }
    const positions = projectLinks(project, CARD_LINK_KINDS).map((link) => order.get(link.kind))
    assert.deepEqual(positions, [...positions].sort((a, b) => Number(a) - Number(b)), `${project.slug}: links must render live → video → repo`)
  }
})

// ---------------------------------------------------------------------------
// Label overrides + label in name (WCAG 2.5.3) — review R-PR39 LOW/MEDIUM-4
// ---------------------------------------------------------------------------

test("a slot label can be overridden, and the override reaches the accessible name", () => {
  const links = projectLinks(
    fixture({ liveUrl: LIVE, linkLabels: { live: "Tender dashboard" } }),
  )
  assert.equal(links[0].label, "Tender dashboard")
  assert.match(links[0].ariaLabel, /Tender dashboard/, "aria-label must contain the visible label")
})

test("the tender dashboard is labelled for what it is, not 'Live demo'", () => {
  const tender = projects.find((project) => project.slug === "tender-rfq-finder")
  assert.ok(tender, "tender-rfq-finder must exist in the shipped data")
  const live = projectLinks(tender).find((link) => link.kind === "live")
  assert.ok(live, "the tender entry must expose its live slot")
  assert.equal(live.label, "Tender dashboard")
  assert.equal(live.href, "https://gashotech.com/tenders", "the owner-confirmed destination is unchanged")
})

test("every rendered link's accessible name contains its visible label (2.5.3 label in name)", () => {
  for (const project of projects) {
    for (const link of projectLinks(project)) {
      assert.ok(
        link.ariaLabel.toLowerCase().includes(link.label.toLowerCase()),
        `${project.slug}:${link.kind} aria-label "${link.ariaLabel}" must contain the visible label "${link.label}"`,
      )
    }
  }
})

test("hosting names the hosting page in its accessible name", () => {
  const links = projectLinks(fixture({ hostingUrl: "https://vercel.com/dashboard/example" }))
  assert.equal(links.length, 1)
  assert.equal(links[0].label, "Hosting")
  assert.match(links[0].ariaLabel, /hosting page/)
})

// ---------------------------------------------------------------------------
// URL hygiene — review R-PR39 OPTIONAL
// ---------------------------------------------------------------------------

test("trailing-slash variants of one destination collapse to a single link", () => {
  const links = projectLinks(
    fixture({ liveUrl: "https://demo.example.com/tenders", hostingUrl: "https://demo.example.com/tenders/" }),
  )
  assert.equal(links.length, 1)
  assert.equal(links[0].kind, "live")
})

test("control characters and backslashes are never renderable", () => {
  const refused = [
    "https://example.com/a\\b",
    "https://example.com/a\u0000b",
    "https://example.com/a\u001fb",
    "https://example.com/a\u007fb",
  ]
  for (const value of refused) {
    assert.equal(isRenderableUrl(value), false, `${JSON.stringify(value)} must be refused`)
  }
})

test("invisible directional and zero-width characters are never renderable", () => {
  const refused = [
    "https://example.com/\u061cgnp", // ALM
    "https://example.com/\u200egnp", // LRM
    "https://example.com/\u200fgnp", // RLM
    "https://example.com/\u200bgnp", // zero-width space
    "https://example.com/a\u0085b", // NEL
  ]
  for (const value of refused) {
    assert.equal(isRenderableUrl(value), false, `${JSON.stringify(value)} must be refused`)
  }
})
