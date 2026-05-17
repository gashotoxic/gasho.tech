import { NextResponse } from "next/server";
import blogsData from "@/data/blogs.json";

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
      <title><![CDATA[${post.title}]]></title>
      <link>${siteUrl}/blogs/${post.slug}</link>
      <guid>${siteUrl}/blogs/${post.slug}</guid>
      <description><![CDATA[${post.excerpt}]]></description>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <author>${post.author}</author>
      <category>${post.category}</category>
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
