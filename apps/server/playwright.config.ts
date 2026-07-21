import { defineConfig, devices } from "@playwright/test";

// End-to-end tests for the dashboard, driven against a real Next.js server backed
// by a freshly-seeded SQLite database (see e2e/prepare-db.mjs). Kept off the unit
// port (3000) so a running dev server doesn't clash.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATABASE_URL = "file:./e2e-test.db";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // one shared seeded DB → keep tests sequential & deterministic
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Seed the DB, then build & serve a PRODUCTION bundle. We deliberately do NOT
    // use `next dev`: under Turbopack dev the HMR websocket can't complete its
    // handshake inside headless Chromium, and the dev client then never hydrates
    // the page — every form/button is dead, so auth (and everything after it)
    // fails. `next start` has no HMR and hydrates reliably. The session cookie is
    // `Secure` in production, which is fine here: Chromium treats http://127.0.0.1
    // as a secure context, so the cookie is still stored and sent.
    // (prepare-db.mjs seeds with NODE_ENV=development internally, so the demo
    // password stays the well-known "kidora1234" regardless of the build env.)
    command: `node e2e/prepare-db.mjs && npm run build && npm run start -- -p ${PORT}`,
    url: `${BASE_URL}/login`,
    env: {
      DATABASE_URL,
      AUTH_SECRET: "e2e-insecure-test-secret-not-for-production",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000, // a cold production build can take a couple of minutes
    stdout: "pipe",
    stderr: "pipe",
  },
});
