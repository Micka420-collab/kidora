import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next dev blocks internal-asset (fonts, HMR websocket) requests from origins
  // other than localhost with a 403 → a blank page when you open the dev server
  // via a LAN IP (e.g. to test a phone on the same Wi-Fi). Allow-list extra dev
  // origins via DEV_LAN_ORIGIN (comma-separated), e.g. DEV_LAN_ORIGIN=192.168.1.48.
  ...(process.env.DEV_LAN_ORIGIN
    ? { allowedDevOrigins: process.env.DEV_LAN_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean) }
    : {}),
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
    // HTTPS-forcing headers (HSTS + upgrade-insecure-requests) belong ONLY in
    // production. Over plain http (local dev / LAN testing on an IP) they upgrade
    // every request to https on a server with no TLS → ERR_SSL_PROTOCOL_ERROR and
    // a blank page. So gate them on NODE_ENV.
    const isProd = process.env.NODE_ENV === "production";

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
      ...(isProd ? ["upgrade-insecure-requests"] : []),
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
          // HSTS + COOP only in production. Over plain http they're ignored (COOP
          // needs a trustworthy origin) or actively harmful (HSTS pins the LAN IP
          // to https for 2y), which breaks local/LAN testing.
          ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
          ...(isProd ? [{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }] : []),
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;
