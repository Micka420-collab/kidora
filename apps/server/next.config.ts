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
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;
