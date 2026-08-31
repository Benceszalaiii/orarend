import type { NextConfig } from "next";

const JEDLIK_API = "https://jedlikinfo.jedlik.eu/api/api";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/jedlik/:path*",
        destination: `${JEDLIK_API}/:path*`,
      },
    ];
  },
};

export default nextConfig;
