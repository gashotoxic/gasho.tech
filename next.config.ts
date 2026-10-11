import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
