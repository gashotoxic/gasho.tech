import { test } from "node:test"
import assert from "node:assert/strict"

import {
  applyPostUpdate,
  buildNewPost,
  normalizeSlug,
  type BlogPostShape,
} from "../lib/blog-post-update.ts"

const EXISTING: BlogPostShape = {
  slug: "existing-post",
  title: "Existing title",
  excerpt: "Existing excerpt",
  content: "Existing content",
  author: "GashoTech Team",
  category: "AI",
  date: "2026-10-01",
  image: "/images/AI.webp",
  published: true,
  tags: ["ai", "policy"],
  readTime: 4,
}

test("an update keeps every field the caller did not send", () => {
  const saved = applyPostUpdate(EXISTING, { title: "New title" })

  assert.equal(saved.title, "New title")
  assert.equal(saved.content, EXISTING.content)
  assert.equal(saved.excerpt, EXISTING.excerpt)
  assert.equal(saved.author, EXISTING.author)
  assert.equal(saved.category, EXISTING.category)
  assert.equal(saved.image, EXISTING.image)
  assert.equal(saved.published, true)
  // Regression: `tags` and `readTime` exist on most posts in data/blogs.json and
  // must survive an admin edit.
  assert.deepEqual(saved.tags, ["ai", "policy"])
  assert.equal(saved.readTime, 4)
})

test("an update cannot rewrite the slug or the publish date", () => {
  const saved = applyPostUpdate(EXISTING, {
    slug: "hijacked",
    date: "1999-01-01",
    title: "New title",
  })

  assert.equal(saved.slug, "existing-post")
  assert.equal(saved.date, "2026-10-01")
})

test("unknown and wrongly-typed fields are dropped, not merged", () => {
  const saved = applyPostUpdate(EXISTING, {
    title: "  ",
    published: "false",
    tags: ["ai", 42, "  ", "security"],
    readTime: "12",
    injected: { evil: true },
    __proto__: { polluted: true },
  }) as BlogPostShape & Record<string, unknown>

  // Blank strings and wrong types keep the stored value.
  assert.equal(saved.title, EXISTING.title)
  assert.equal(saved.published, true)
  assert.equal(saved.readTime, 4)
  // Arrays are filtered down to real, non-empty strings.
  assert.deepEqual(saved.tags, ["ai", "security"])
  assert.equal("injected" in saved, false)
  assert.equal("polluted" in saved, false)
})

test("readTime and tags can be set explicitly", () => {
  const saved = applyPostUpdate(EXISTING, { readTime: 9, tags: ["x"] })
  assert.equal(saved.readTime, 9)
  assert.deepEqual(saved.tags, ["x"])
})

test("a create builds a complete post from the body alone", () => {
  const created = buildNewPost(
    { title: "Hello World", content: "Body", tags: ["news"], readTime: 3 },
    "hello-world"
  )

  assert.ok(created)
  assert.equal(created.slug, "hello-world")
  assert.equal(created.title, "Hello World")
  assert.equal(created.excerpt, "Hello World")
  assert.equal(created.author, "GashoTech Team")
  assert.equal(created.category, "Technology")
  assert.equal(created.image, "/images/AI.webp")
  assert.equal(created.published, true)
  assert.deepEqual(created.tags, ["news"])
  assert.equal(created.readTime, 3)
  assert.match(created.date, /^\d{4}-\d{2}-\d{2}$/)
})

test("a create without a title or content is refused", () => {
  assert.equal(buildNewPost({ title: "", content: "x" }, "x"), null)
  assert.equal(buildNewPost({ title: "x", content: "" }, "x"), null)
  assert.equal(buildNewPost({ title: "x" }, "x"), null)
  assert.equal(buildNewPost(null, "x"), null)
})

test("slugs are normalised and bounded", () => {
  assert.equal(normalizeSlug("Hello, World!", "fallback"), "hello-world")
  assert.equal(normalizeSlug("  Trailing -- dashes  ", "fallback"), "trailing-dashes")
  assert.equal(normalizeSlug("", "Derived Slug"), "derived-slug")
  assert.equal(normalizeSlug(undefined, "Derived Slug"), "derived-slug")
  assert.equal(normalizeSlug("../../etc/passwd", ""), "etc-passwd")
  assert.equal(normalizeSlug("x".repeat(200), ""), null)
  assert.equal(normalizeSlug("!!!", ""), null)
  assert.equal(normalizeSlug(42, ""), null)
})
