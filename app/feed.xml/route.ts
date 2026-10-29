import { NextResponse } from "next/server";
import blogsData from "@/data/blogs.json";
import { buildRssFeed } from "@/lib/feed";

/**
 * RSS feed. The document itself is built by `lib/feed.ts` so the XML escaping
 * (CDATA splitting, entity escaping) can be unit-tested against hostile post
 * text — this route only picks the Content-Type.
 */
export async function GET() {
  const rss = buildRssFeed(blogsData.posts);

  return new NextResponse(rss, {
    headers: { "Content-Type": "application/xml" },
  });
}
