import { test } from "node:test"
import assert from "node:assert/strict"

import {
  HOUSE_IMAGE_PATH,
  MAX_SLUG_LENGTH,
  applyPostUpdate,
  buildNewPost,
  normalizeSlug,
  slugify,
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

test("an optional field is cleared by an explicit empty string", () => {
  // Key-absent means "keep what is stored"; '' means "clear it". The old
  // truthiness check collapsed the two, so the studio could never remove an
  // excerpt, a byline, a category or a hero image.
  const saved = applyPostUpdate(EXISTING, {
    excerpt: "",
    author: "",
    category: "",
    image: "",
  })

  assert.equal(saved.excerpt, "")
  assert.equal(saved.author, "")
  assert.equal(saved.category, "")
  assert.equal(saved.image, "")
  // Everything else still survives.
  assert.equal(saved.content, EXISTING.content)
  assert.equal(saved.title, EXISTING.title)
})

test("an explicit undefined is the same as not sending the field", () => {
  const saved = applyPostUpdate(EXISTING, {
    excerpt: undefined,
    image: undefined,
    author: undefined,
  })

  assert.equal(saved.excerpt, EXISTING.excerpt)
  assert.equal(saved.image, EXISTING.image)
  assert.equal(saved.author, EXISTING.author)
})

test("a required field cannot be cleared, only rewritten", () => {
  const saved = applyPostUpdate(EXISTING, { title: "", content: "   " })
  assert.equal(saved.title, EXISTING.title)
  assert.equal(saved.content, EXISTING.content)
})

test("an updated title is stored trimmed", () => {
  const saved = applyPostUpdate(EXISTING, { title: "  Spaced Title  " })
  assert.equal(saved.title, "Spaced Title")
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

const ARCHIVED = {
  slug: "archived-post",
  title: "Archived post",
  excerpt: "The excerpt a human wrote",
  content: "old body",
  author: "GashoTech",
  category: "Policy",
  date: "2025-02-14",
  image: "/images/archived-post.webp",
  published: true,
  tags: ["kenya"],
  readTime: 7,
}

test("re-publishing keeps the archived date, image, excerpt, author and category", () => {
  // The studio sends only what it generates: title + body. Everything else was
  // defaulted on the create path and used to reset the archive entry.
  const rebuilt = buildNewPost(
    { title: "Archived post", content: "new body", published: true },
    "archived-post",
    ARCHIVED
  )

  assert.ok(rebuilt)
  assert.equal(rebuilt.content, "new body", "the new body must win")
  assert.equal(rebuilt.date, ARCHIVED.date, "the publish date was reset to today")
  assert.equal(rebuilt.image, ARCHIVED.image, "the hero image was reset")
  assert.equal(rebuilt.excerpt, ARCHIVED.excerpt, "the excerpt was replaced with the title")
  assert.equal(rebuilt.author, ARCHIVED.author)
  assert.equal(rebuilt.category, ARCHIVED.category)
  assert.deepEqual(rebuilt.tags, ARCHIVED.tags)
  assert.equal(rebuilt.readTime, ARCHIVED.readTime)
})

test("an explicit field on a re-publish still wins over the archived one", () => {
  const rebuilt = buildNewPost(
    {
      title: "Archived post",
      content: "new body",
      excerpt: "fresh excerpt",
      author: "Denis",
      category: "AI",
      image: "/images/blog/new.webp",
      tags: ["new"],
      readTime: 3,
      published: false,
    },
    "archived-post",
    ARCHIVED
  )

  assert.ok(rebuilt)
  assert.equal(rebuilt.excerpt, "fresh excerpt")
  assert.equal(rebuilt.author, "Denis")
  assert.equal(rebuilt.category, "AI")
  assert.equal(rebuilt.image, "/images/blog/new.webp")
  assert.deepEqual(rebuilt.tags, ["new"])
  assert.equal(rebuilt.readTime, 3)
  assert.equal(rebuilt.published, false)
  assert.equal(rebuilt.date, ARCHIVED.date, "the date is never rewritten by a re-publish")
})

test("a re-publish can clear an optional field with an explicit empty string", () => {
  const rebuilt = buildNewPost(
    { title: "Archived post", content: "new body", excerpt: "", image: "" },
    "archived-post",
    ARCHIVED
  )

  assert.ok(rebuilt)
  assert.equal(rebuilt.excerpt, "", "an explicit '' must clear the archived excerpt")
  assert.equal(rebuilt.image, "", "an explicit '' must clear the archived hero")
  assert.equal(rebuilt.author, ARCHIVED.author, "fields that were not sent keep their value")
})

test("a re-publish that sends undefined keeps the archived value", () => {
  const rebuilt = buildNewPost(
    { title: "Archived post", content: "new body", image: undefined, excerpt: undefined },
    "archived-post",
    ARCHIVED
  )

  assert.ok(rebuilt)
  assert.equal(rebuilt.image, ARCHIVED.image)
  assert.equal(rebuilt.excerpt, ARCHIVED.excerpt)
})

test("a stored title is trimmed", () => {
  const rebuilt = buildNewPost({ title: "  Padded Title  ", content: "body" }, "padded-title")
  assert.ok(rebuilt)
  assert.equal(rebuilt.title, "Padded Title")
})

test("the house hero is the documented fallback", () => {
  const created = buildNewPost({ title: "No Image", content: "body" }, "no-image")
  assert.ok(created)
  assert.equal(created.image, HOUSE_IMAGE_PATH)
})

test("slugify is exported so a caller can explain a refused slug", () => {
  assert.equal(slugify("Hello, World!"), "hello-world")
  assert.equal(slugify("!!!"), "")
  // `normalizeSlug` bounds the length; `slugify` does not, which is what lets the
  // route say "this title becomes a 149-character URL".
  const long = "x".repeat(MAX_SLUG_LENGTH + 1)
  assert.equal(slugify(long).length, MAX_SLUG_LENGTH + 1)
  assert.equal(normalizeSlug(long, ""), null)
  assert.equal(normalizeSlug("x".repeat(MAX_SLUG_LENGTH), ""), "x".repeat(MAX_SLUG_LENGTH))
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
