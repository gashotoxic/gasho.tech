import { NextResponse } from "next/server";
import blogsData from "@/data/blogs.json";

/** Text content in an XML document, escape the five predefined entities. */
function xmlText(value: unknown): string {
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
function cdata(value: unknown): string {
  return String(value ?? "").replace(/\]\]>/g, "]]]]><![CDATA[>");
}

export async function GET() {
  const siteTitle = "GashoTech Blog";
  const siteDescription =
    "Insights, news, and updates on AI, automation, cybersecurity, and technology";
  const siteUrl = "https://gashotech.com";

  const items = blogsData.posts
    .filter((post) => post.published)
    .map(
      (post) => `
    <item>
      <title><![CDATA[${cdata(post.title)}]]></title>
      <link>${siteUrl}/blogs/${xmlText(post.slug)}</link>
      <guid>${siteUrl}/blogs/${xmlText(post.slug)}</guid>
      <description><![CDATA[${cdata(post.excerpt)}]]></description>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <author>${xmlText(post.author)}</author>
      <category>${xmlText(post.category)}</category>
    </item>`
    )
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${siteTitle}</title>
    <link>${siteUrl}</link>
    <description>${siteDescription}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

  return new NextResponse(rss, {
    headers: { "Content-Type": "application/xml" },
  });
}
