import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Prisma engine + DB drivers (SQLite dev / Postgres prod) out of the bundle
  // so the right native driver is required lazily at runtime (see src/lib/prisma.ts).
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
    "@prisma/adapter-pg",
    "pg",
    "web-push",
  ],
  async headers() {
    // Content-Security-Policy. 'unsafe-inline' is kept for styles/scripts that
    // Next injects without a nonce; everything else is locked to 'self'.
    // img-src allows YouTube thumbnails; connect-src 'self' for the API.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // img: YouTube thumbnails + OpenStreetMap tiles (location map).
      "img-src 'self' data: blob: https://img.youtube.com https://i.ytimg.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self'",
      // frame: the OpenStreetMap embed used on the location tab.
      "frame-src 'self' https://www.openstreetmap.org",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
