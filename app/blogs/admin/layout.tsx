import type { Metadata } from "next"

/**
 * `/blogs/admin` is a signed-in authoring surface: it must not be indexed or
 * advertised in search results.
 *
 * `app/robots.ts` disallows the path, but robots.txt only asks crawlers not to
 * fetch — a page that is already linked or was indexed before can still be
 * listed. The page itself is a client component (`page.tsx`), which cannot
 * export `metadata`, so the noindex directive lives in this segment layout.
 */
export const metadata: Metadata = {
  title: "Blog Admin | GashoTech",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
}

export default function BlogAdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
