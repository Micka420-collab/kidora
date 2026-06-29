import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Prisma engine + native SQLite driver out of the bundle.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
  ],
  eslint: {
    // Don't fail production builds on lint; we run lint separately.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
