import type { NextConfig } from "next";

/**
 * When this bundle was built, baked in at build time.
 *
 * `data/blogs.json`'s mtime describes when a file landed on *this* filesystem,
 * which a warm workspace copy can rewrite moments before serving a months-old
 * checkout — so it cannot answer "how old is the archive this deployment ships?".
 * This can: it is evaluated while `next build` runs and inlined into the bundle,
 * which is exactly the deployment's build time. Consumers: lib/blog-snapshot.ts.
 */
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    localPatterns: [
      { pathname: "/images/**" },
      { pathname: "/images/**", search: "?v=*" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/services/computer",
        destination: "/services/agents",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
