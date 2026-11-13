import type { MetadataRoute } from "next"

/**
 * `/blogs/admin` is disallowed here: the panel is session-gated and every page
 * of it advertises a post-authoring surface nobody should find through search.
 * robots.txt is a request to crawlers, not an access control, so the page also
 * sets `robots: noindex` in its own metadata (app/blogs/admin/layout.tsx).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/blogs/admin"],
    },
    sitemap: "https://gashotech.com/sitemap.xml",
  }
}
