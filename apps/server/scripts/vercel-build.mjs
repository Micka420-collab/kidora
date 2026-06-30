// Robust Vercel build.
//
// The old `vercel-build` was `npm run db:push && next build`, so if the
// Production environment had no reachable DATABASE_URL the `prisma db push`
// failed and the WHOLE build failed → no deployment → the domain returned a
// blank Vercel 404 (NOT_FOUND), which is very hard to diagnose.
//
// This script instead:
//   - runs `prisma db push` only when a DATABASE_URL is actually configured
//     (so a correctly-configured deploy still gets its schema created at build,
//     unchanged behaviour);
//   - otherwise SKIPS the push with a loud, actionable warning and still builds
//     the app, so the site deploys (DB-backed routes will error at runtime, but
//     the deployment exists and the misconfiguration is obvious in the logs).
//
// Note: if DATABASE_URL *is* set but the push fails (bad credentials, network),
// the build still fails on purpose — that's a real error worth surfacing.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/** Read a var from the process env, falling back to a minimal .env parse. */
function readEnv(key) {
  if (process.env[key] != null && process.env[key] !== "") return process.env[key];
  if (!existsSync(".env")) return "";
  const line = readFileSync(".env", "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith(`${key}=`));
  if (!line) return "";
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const databaseUrl = readEnv("DATABASE_URL").trim();

if (databaseUrl) {
  console.log("[vercel-build] DATABASE_URL detected → syncing schema (prisma db push)…");
  run("npm run db:push");
} else {
  console.warn(
    "\n[vercel-build] ⚠  No DATABASE_URL set — skipping `prisma db push` so the build still succeeds.\n" +
      "[vercel-build]    The site will deploy, but database-backed pages/routes will fail at runtime.\n" +
      "[vercel-build]    Fix: set DATABASE_URL (a reachable Postgres) and AUTH_SECRET in the Vercel\n" +
      "[vercel-build]    project's Production environment variables, then redeploy.\n",
  );
  // Still generate the Prisma client so `next build` can compile against it.
  run("npm run db:generate");
}

run("next build");
