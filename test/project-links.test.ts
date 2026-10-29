import { test } from "node:test"
import assert from "node:assert/strict"

import {
  CARD_LINK_KINDS,
  PROJECT_LINK_KINDS,
  TIER1_CHECKS,
  isRenderableUrl,
  linksToPath,
  projectLinks,
  projectLinksTo,
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

/**
 * Every invisible / formatting character the URL gate refuses, by name and codepoint. The
 * table is the regression guard: deleting a codepoint from `isRenderableUrl()` while it is
 * still listed here fails the run, so the blocklist cannot silently shrink (review R-PR39).
 */
const INVISIBLE_BLOCKLIST: ReadonlyArray<readonly [string, string]> = [
  ["\u0085", "NEL (U+0085)"],
  ["\u061c", "ARABIC LETTER MARK (U+061C)"],
  ["\u180e", "MONGOLIAN VOWEL SEPARATOR (U+180E)"],
  ["\u200b", "ZERO WIDTH SPACE (U+200B)"],
  ["\u200c", "ZERO WIDTH NON-JOINER (U+200C)"],
  ["\u200d", "ZERO WIDTH JOINER (U+200D)"],
  ["\u200e", "LEFT-TO-RIGHT MARK (U+200E)"],
  ["\u200f", "RIGHT-TO-LEFT MARK (U+200F)"],
  ["\u202a", "LEFT-TO-RIGHT EMBEDDING (U+202A)"],
  ["\u202b", "RIGHT-TO-LEFT EMBEDDING (U+202B)"],
  ["\u202c", "POP DIRECTIONAL FORMATTING (U+202C)"],
  ["\u202d", "LEFT-TO-RIGHT OVERRIDE (U+202D)"],
  ["\u202e", "RIGHT-TO-LEFT OVERRIDE (U+202E)"],
  ["\u2060", "WORD JOINER (U+2060)"],
  ["\u2066", "LEFT-TO-RIGHT ISOLATE (U+2066)"],
  ["\u2067", "RIGHT-TO-LEFT ISOLATE (U+2067)"],
  ["\u2068", "FIRST STRONG ISOLATE (U+2068)"],
  ["\u2069", "POP DIRECTIONAL ISOLATE (U+2069)"],
  ["\ufeff", "ZERO WIDTH NO-BREAK SPACE / BOM (U+FEFF)"],
]

test("every invisible directional, zero-width and joiner character is never renderable", () => {
  // The untainted URL is renderable — so a failure below is about the character, not the shape.
  assert.equal(isRenderableUrl("https://example.com/gnp"), true)
  for (const [character, name] of INVISIBLE_BLOCKLIST) {
    const smuggled = `https://example.com/${character}gnp`
    const midline = `https://example.com/a${character}b`
    assert.equal(isRenderableUrl(smuggled), false, `${name} must be refused at the path start`)
    assert.equal(isRenderableUrl(midline), false, `${name} must be refused mid-path`)
  }
})

test("refusing invisible characters does not over-block ordinary URLs", () => {
  const accepted = [
    "https://example.com/tenders",
    "https://gashotech.com/projects/tender-rfq-finder",
    "https://example.com/caf%C3%A9",
    "https://example.com/a?b=c#d",
  ]
  for (const value of accepted) {
    assert.equal(isRenderableUrl(value), true, `${value} must stay renderable`)
  }
})

// ---------------------------------------------------------------------------
// One destination, one link — the tender CTA predicate (review R-PR39 LOW / item 9)
// ---------------------------------------------------------------------------

test("linksToPath compares the URL path only — host, query and hash are irrelevant", () => {
  assert.equal(linksToPath("https://gashotech.com/tenders", "/tenders"), true)
  assert.equal(linksToPath("https://gasho.tech/tenders", "/tenders"), true)
  assert.equal(linksToPath("https://tenders.gashotech.com/tenders", "/tenders"), true)
  assert.equal(linksToPath("https://gashotech.com/tenders?q=1#top", "/tenders"), true)
  assert.equal(linksToPath("https://gashotech.com/tenders/", "/tenders"), true)
  assert.equal(linksToPath("https://gashotech.com/tenders", "/tenders/"), true)
  assert.equal(
    linksToPath("https://gashotech.com/%74enders", "/tenders"),
    true,
    "a percent-encoded path is the same page to a browser — it must not resurrect the CTA",
  )
  assert.equal(linksToPath("https://gashotech.com/%zz", "/tenders"), false, "a malformed escape must not throw")
  assert.equal(linksToPath("https://gashotech.com/tenders-old", "/tenders"), false)
  assert.equal(linksToPath("https://gashotech.com/tender", "/tenders"), false)
  assert.equal(linksToPath("https://gashotech.com/", "/tenders"), false)
  assert.equal(linksToPath("/tenders", "/tenders"), false, "a bare path is not a URL")
  assert.equal(linksToPath("", "/tenders"), false)
})

test("a live slot that already opens /tenders suppresses the duplicate CTA, on any GashoTech host", () => {
  for (const origin of ["https://gashotech.com", "https://gasho.tech"]) {
    assert.equal(
      projectLinksTo(fixture({ liveUrl: `${origin}/tenders` }), "/tenders"),
      true,
      `${origin}: moving the tender liveUrl between our own domains must not restore the CTA`,
    )
  }
})

test("the CTA survives when the live slot is absent or points elsewhere", () => {
  assert.equal(projectLinksTo(fixture({ liveUrl: "https://demo.example.com" }), "/tenders"), false)
  assert.equal(projectLinksTo(fixture({ demoVideoUrl: VIDEO }), "/tenders"), false, "no live slot at all")
  assert.equal(projectLinksTo(fixture(), "/tenders"), false, "no links at all")
})

test("only the live slot counts — another slot at /tenders does not hide the CTA", () => {
  const project = fixture({
    liveUrl: "https://demo.example.com",
    hostingUrl: "https://demo.example.com/tenders",
  })
  assert.equal(projectLinksTo(project, "/tenders"), false)
})

test("the shipped tender entry's live slot is /tenders, so its detail page renders one link not two", () => {
  const tender = projects.find((project) => project.slug === "tender-rfq-finder")
  assert.ok(tender, "tender-rfq-finder must exist in the shipped data")
  assert.equal(
    projectLinksTo(tender, "/tenders"),
    true,
    "if this flips to false the hero renders the dashboard twice — fix the data, not the test",
  )
  const live = projectLinks(tender).filter((link) => link.kind === "live")
  assert.equal(live.length, 1)
  assert.equal(linksToPath(live[0].href, "/tenders"), true)
})
