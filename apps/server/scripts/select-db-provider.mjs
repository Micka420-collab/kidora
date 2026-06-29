#!/usr/bin/env node
// Align the Prisma datasource `provider` with the target database BEFORE
// `prisma generate` / `db push`, because the generated client's SQL dialect is
// baked in at generate time and `provider` cannot be an env() variable.
//
// Provider resolution (first match wins):
//   1) DATABASE_PROVIDER = "postgresql" | "sqlite"   (explicit override)
//   2) DATABASE_URL scheme: postgres:// | postgresql://  -> postgresql
//                           anything else (file:, undefined) -> sqlite
//
// Idempotent: only rewrites prisma/schema.prisma when the provider changes.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../prisma/schema.prisma");

function resolveProvider() {
  const explicit = (process.env.DATABASE_PROVIDER || "").trim().toLowerCase();
  if (explicit === "postgresql" || explicit === "postgres") return "postgresql";
  if (explicit === "sqlite") return "sqlite";
  const url = process.env.DATABASE_URL || "";
  return /^postgres(?:ql)?:\/\//i.test(url) ? "postgresql" : "sqlite";
}

const provider = resolveProvider();
const schema = readFileSync(schemaPath, "utf8");

// Replace the provider inside the `datasource db { ... }` block only.
const re = /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")(sqlite|postgresql)(")/s;
const m = schema.match(re);
if (!m) {
  console.error("select-db-provider: could not find datasource provider in schema.prisma");
  process.exit(1);
}

if (m[2] === provider) {
  console.log(`select-db-provider: provider already "${provider}" — no change`);
} else {
  const updated = schema.replace(re, `$1${provider}$3`);
  writeFileSync(schemaPath, updated);
  console.log(`select-db-provider: provider "${m[2]}" -> "${provider}"`);
}
