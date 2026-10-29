/**
 * JSON-LD serialization for raw `<script type="application/ld+json">` sinks.
 *
 * `JSON.stringify` alone is NOT safe in that position: it leaves `<` intact, so any value
 * containing `</script>` closes the element and lets whatever follows run as markup. The
 * content that reaches these sinks is author-supplied (blog titles and excerpts from the
 * publish pipeline, service copy, project fields), so the escaping belongs here rather than
 * being re-implemented per route — one unescaped sink is the hole, and a local copy in one
 * file does nothing for the other two.
 *
 * `<` → `\u003c` keeps the payload inert while remaining valid JSON for crawlers. U+2028 and
 * U+2029 are legal inside a JavaScript string literal but not raw, so they are escaped for
 * the same reason.
 *
 * Use this for EVERY `dangerouslySetInnerHTML` JSON-LD sink:
 * `app/layout.tsx`, `app/projects/[slug]`, `app/blogs/[slug]`, `app/services/[slug]`.
 */
export function toJsonLd(schema: unknown): string {
  // `JSON.stringify(undefined)` returns undefined at runtime even though the lib type says
  // string; "null" is the valid JSON-LD stand-in and keeps the `.replace` chain total.
  const json = JSON.stringify(schema) ?? "null"
  return json
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}
