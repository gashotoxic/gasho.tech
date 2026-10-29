import { test } from "node:test"
import assert from "node:assert/strict"

import { safeJsonLd, xmlCdata, xmlText } from "../lib/escape.ts"
import { buildRssFeed, type FeedPost } from "../lib/feed.ts"

/**
 * Regression tests for the escaping in the two sinks that are not rendered by
 * React: the RSS feed (`/feed.xml`) and the JSON-LD block on a post page.
 *
 * The review that found these protections verified them by probing the live
 * site. A probe does not survive a refactor — these do. They drive the same
 * functions the route and page import, with hostile stored text, and assert the
 * text can no longer terminate its own context.
 */

function post(overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    slug: "a-post",
    title: "A post",
    excerpt: "An excerpt",
    author: "GashoTech",
    category: "AI",
    date: "2026-09-13",
    published: true,
    ...overrides,
  }
}

test("xmlText escapes the five predefined entities", () => {
  assert.equal(
    xmlText(`<a href="x">Tom & Jerry's</a>`),
    "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;"
  )
  assert.equal(xmlText(undefined), "")
})

test("xmlCdata splits ]]> so a title cannot end its own CDATA block", () => {
  assert.equal(xmlCdata("safe text"), "safe text")
  assert.equal(xmlCdata("break ]]> out"), "break ]]]]><![CDATA[> out")
})

test("safeJsonLd keeps </script> from closing the element, but stays valid JSON", () => {
  const hostile = { headline: "</script><img src=x onerror=alert(1)>" }
  const encoded = safeJsonLd(hostile)

  assert.equal(encoded.includes("</script"), false, "raw </script> reached the document")
  assert.equal(encoded.includes("<"), false, "raw < reached the document")
  assert.deepEqual(JSON.parse(encoded), hostile, "escaping changed the payload")
})

test("the feed renders hostile post text inside its CDATA, not as markup", () => {
  const feed = buildRssFeed([
    post({
      title: "Brexit ]]> and <script>alert(1)</script>",
      excerpt: "Excerpt with ]]> in it",
      author: 'Gasho "Tech" & Co',
    }),
    post({ slug: "unpublished", published: false }),
  ])

  // The feed is a single channel with one item: the unpublished post is skipped.
  assert.equal(feed.match(/<item>/g)?.length, 1)

  // The CDATA block that carries the title closes exactly once, at the intended
  // place: the payload's own `]]>` was split.
  assert.match(feed, /<title><!\[CDATA\[Brexit \]\]\]\]><!\[CDATA\[> and <script>alert\(1\)<\/script>\]\]><\/title>/)
  assert.equal(feed.includes("Excerpt with ]]> in it"), false)
  assert.match(feed, /<description><!\[CDATA\[Excerpt with \]\]\]\]><!\[CDATA\[> in it\]\]><\/description>/)

  // Attribute/entity-escaped fields stay escaped.
  assert.match(feed, /<author>Gasho &quot;Tech&quot; &amp; Co<\/author>/)
  assert.equal(feed.includes("<script>alert(1)</script></title>"), false)
})

test("the feed keeps every published post and a stable lastBuildDate", () => {
  const feed = buildRssFeed(
    [post({ slug: "one" }), post({ slug: "two" }), post({ slug: "three", published: false })],
    new Date("2026-10-29T00:00:00Z")
  )

  assert.equal(feed.match(/<item>/g)?.length, 2)
  assert.match(feed, /<link>https:\/\/gashotech\.com\/blogs\/one<\/link>/)
  assert.match(feed, /<lastBuildDate>Thu, 29 Oct 2026 00:00:00 GMT<\/lastBuildDate>/)
  assert.match(feed, /^<\?xml version="1.0" encoding="UTF-8"\?>/)
})
