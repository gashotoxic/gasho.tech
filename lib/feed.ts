/**
 * RSS 2.0 document builder for `/feed.xml`.
 *
 * Pure and framework-free so the escaping can be tested against hostile post
 * text: the route that serves this only adds a Content-Type. Every field written
 * into the XML goes through `xmlText`/`xmlCdata` from `lib/escape.ts` — a raw
 * `]]>` in a title ends the CDATA block early, and a raw `&` makes the feed
 * invalid XML that readers drop entirely.
 */

import { xmlCdata, xmlText } from "./escape.ts";

/** The subset of a stored post the feed renders. */
export interface FeedPost {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  category: string;
  date: string;
  published: boolean;
}

const SITE_URL = "https://gashotech.com";
const SITE_TITLE = "GashoTech Blog";
const SITE_DESCRIPTION =
  "Insights, news, and updates on AI, automation, cybersecurity, and technology";

export function buildRssFeed(posts: readonly FeedPost[], now: Date = new Date()): string {
  const items = posts
    .filter((post) => post.published)
    .map(
      (post) => `
    <item>
      <title><![CDATA[${xmlCdata(post.title)}]]></title>
      <link>${SITE_URL}/blogs/${xmlText(post.slug)}</link>
      <guid>${SITE_URL}/blogs/${xmlText(post.slug)}</guid>
      <description><![CDATA[${xmlCdata(post.excerpt)}]]></description>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <author>${xmlText(post.author)}</author>
      <category>${xmlText(post.category)}</category>
    </item>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlText(SITE_TITLE)}</title>
    <link>${SITE_URL}</link>
    <description>${xmlText(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;
}
