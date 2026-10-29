/**
 * Escaping for the places where stored post text lands in markup that React does
 * NOT render: the RSS feed (XML) and the JSON-LD block (raw text inside a
 * `<script>` element).
 *
 * Both sinks used to interpolate post fields unescaped, so a title containing
 * `</script>` (JSON-LD) or `]]>` (feed CDATA) could break out of its context.
 * They live here, not inline in the route/page, so they can be unit-tested — a
 * protection that only exists inside a page component cannot be regression
 * tested, and this one was silently missing once already.
 */

/** Text content in an XML document: escape the five predefined entities. */
export function xmlText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * CDATA cannot contain `]]>`; splitting the section around it is the standard
 * way to keep stored text from terminating the block early.
 */
export function xmlCdata(value: unknown): string {
  return String(value ?? "").replace(/\]\]>/g, "]]]]><![CDATA[>");
}

/**
 * JSON for a `<script>` element. The HTML parser ends the script at the first
 * `</script`, so `<` is emitted as the JSON escape `\u003c`: the value parses
 * back unchanged, and stored text can no longer open or close a tag.
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
