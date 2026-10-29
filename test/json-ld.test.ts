import { test } from "node:test"
import assert from "node:assert/strict"

import { toJsonLd } from "../lib/json-ld.ts"

/**
 * JSON-LD escaping (review R-PR39 MEDIUM-3).
 *
 * Every JSON-LD sink is a raw `<script>` element filled via `dangerouslySetInnerHTML`, and
 * the content reaching it is author-supplied (blog titles/excerpts from the publish
 * pipeline, service copy, project fields). A payload containing `</script>` would end the
 * element and run whatever follows as markup. These tests assert the serializer cannot emit
 * one, and that the escaped output is still valid JSON for crawlers.
 */

test("a script-closing payload cannot break out of the JSON-LD element", () => {
  const payload = { headline: "Boom </script><script>alert(1)</script>" }
  const out = toJsonLd(payload)

  assert.ok(!out.includes("</script>"), "serialized JSON-LD must not contain a closing script tag")
  assert.ok(!out.includes("<"), "no raw '<' may reach a raw script sink")
  assert.deepEqual(JSON.parse(out), payload, "escaping must not change the decoded value")
})

test("line and paragraph separators are escaped and the payload still parses", () => {
  const payload = { text: "a\u2028b\u2029c" }
  const out = toJsonLd(payload)

  assert.ok(!out.includes("\u2028"), "U+2028 must be escaped")
  assert.ok(!out.includes("\u2029"), "U+2029 must be escaped")
  assert.deepEqual(JSON.parse(out), payload)
})

test("escaping applies at every depth, including inside nested arrays", () => {
  const out = toJsonLd({ a: [{ b: "</script>" }], c: { d: "<" } })
  assert.ok(!out.includes("<"), "nested '<' must be escaped too")
})

test("undefined serializes to parseable null instead of throwing", () => {
  assert.equal(toJsonLd(undefined), "null")
})

test("lone surrogates stay well-formed and round-trip", () => {
  const payload = { text: "a\ud800b" }
  const out = toJsonLd(payload)

  assert.ok(!out.includes("\ud800"), "a lone surrogate must be escaped, not emitted raw")
  assert.deepEqual(JSON.parse(out), payload)
})
