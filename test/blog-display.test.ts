import { test } from "node:test"
import assert from "node:assert/strict"

import {
  BLOG_AUTHOR_FALLBACK,
  BLOG_HERO_FALLBACK,
  authorFor,
  descriptionFor,
  excerptFor,
  heroPath,
  heroUrl,
} from "../lib/blog-display.ts"

/**
 * An edit can store a cleared field, and every one of these helpers exists
 * because a renderer did something silly with one: an og:image on the homepage,
 * a byline of `""`, a card with a blank line where the excerpt goes.
 */

test("a cleared hero falls back everywhere, including the absolute URL", () => {
  assert.equal(heroPath({ image: "" }), BLOG_HERO_FALLBACK)
  assert.equal(heroPath({}), BLOG_HERO_FALLBACK)
  assert.equal(
    heroUrl({ image: "" }),
    `https://gashotech.com${BLOG_HERO_FALLBACK}`,
    "an empty hero must not become https://gashotech.com"
  )
  assert.equal(heroUrl({ image: "/images/blog/one.webp" }), "https://gashotech.com/images/blog/one.webp")
})

test("a cleared author falls back to the house byline", () => {
  assert.equal(authorFor({ author: "" }), BLOG_AUTHOR_FALLBACK)
  assert.equal(authorFor({ author: "   " }), BLOG_AUTHOR_FALLBACK)
  assert.equal(authorFor({}), BLOG_AUTHOR_FALLBACK)
  assert.equal(authorFor({ author: "Gasho" }), "Gasho")
})

test("a cleared excerpt falls back to the body, then to the title", () => {
  assert.equal(descriptionFor({ excerpt: "", title: "Title" }), "Title")
  assert.equal(descriptionFor({ excerpt: "  Real excerpt  ", title: "Title" }), "Real excerpt")

  const derived = excerptFor({
    excerpt: "",
    title: "Title",
    content: "## Heading\n\nFirst paragraph with **bold** text and a [link](https://example.com).",
  })
  assert.match(derived, /^Heading First paragraph with bold text and a link\.$/)

  assert.equal(excerptFor({ excerpt: "", title: "Only a title" }), "Only a title")
  assert.equal(excerptFor({ excerpt: "Stored excerpt", content: "Body" }), "Stored excerpt")
})

test("a long derived excerpt is cut on a word boundary", () => {
  const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ")
  const derived = excerptFor({ excerpt: "", content: long })
  assert.ok(derived.length <= 161, `excerpt should be at most 161 chars, got ${derived.length}`)
  assert.ok(derived.endsWith("…"), "a truncated excerpt says so")
  assert.doesNotMatch(derived, /word\S*…\S/, "the cut must land between words")
})
