// Prepare an isolated, seeded SQLite database for the E2E run. Invoked by the
// Playwright webServer command BEFORE `next dev` starts, so the app boots against
// a known dataset (demo parent + Emma/Lucas). Idempotent: recreates the file each
// run so tests never depend on left-over state.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const DB_FILE = "e2e-test.db";
const DATABASE_URL = `file:./${DB_FILE}`;
const env = { ...process.env, DATABASE_URL, NODE_ENV: "development" };

// NODE_ENV=development so prisma's dev deps are available and the seed uses the
// well-known demo password ("kidora1234") rather than a random production one.

for (const f of [DB_FILE, `prisma/${DB_FILE}`]) {
  try { rmSync(f, { force: true }); } catch { /* ignore */ }
}

const run = (cmd) => execSync(cmd, { stdio: "inherit", env });

console.log("[e2e] applying migrations to", DATABASE_URL);
run("npx prisma migrate deploy");
console.log("[e2e] seeding demo data");
run("npm run seed");
console.log("[e2e] database ready");
