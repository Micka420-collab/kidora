import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Prisma engine + native SQLite driver out of the bundle.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
  ],
};

export default nextConfig;
