import type { NextConfig } from "next";

const JEDLIK_API = "https://jedlikinfo.jedlik.eu/api/api";

const nextConfig: NextConfig = {
  //! A SERVICE WORKER SOHA NE RAGADJON BE. Ha a böngésző saját gyorsítótára
  //! tartja meg a `sw.js`-t, a régi verzió akár napokig kiszolgálhat régi vázat
  //! — a frissítés ilyenkor nem ér el a felhasználóig.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
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
