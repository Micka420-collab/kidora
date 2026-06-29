import { PrismaClient } from "@/generated/prisma/client";
import { createRequire } from "node:module";

// Lazy CommonJS require so the *unused* native driver is never loaded:
// better-sqlite3 must not be required on a Postgres/Vercel runtime, and pg
// need not be required in local SQLite dev.
const require = createRequire(import.meta.url);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** True when DATABASE_URL points at PostgreSQL (postgres:// or postgresql://). */
function isPostgresUrl(url: string): boolean {
  return /^postgres(?:ql)?:\/\//i.test(url);
}

/**
 * Pick the Prisma driver adapter from DATABASE_URL so one codebase runs on
 * SQLite (dev) and PostgreSQL (prod) with no code change.
 *
 * IMPORTANT: the generated client's SQL dialect is fixed at `prisma generate`
 * time by the schema `provider`, which cannot be an env() var. So
 * `scripts/select-db-provider.mjs` (run on postinstall / prebuild) rewrites that
 * provider from DATABASE_URL, keeping generate-time dialect aligned with the
 * adapter chosen here at runtime.
 */
function createAdapter() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  if (isPostgresUrl(url)) {
    const { PrismaPg } = require("@prisma/adapter-pg");
    return new PrismaPg({ connectionString: url });
  }
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
  return new PrismaBetterSqlite3({ url });
}

function createClient(): PrismaClient {
  return new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
