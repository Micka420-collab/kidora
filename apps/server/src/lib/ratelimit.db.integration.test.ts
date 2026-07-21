import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Integration test: the DB-backed rate-limit store against a real (temporary)
// SQLite database — the exact raw SQL that also runs on Postgres in prod.
// RATE_LIMIT_STORE=db forces the shared store outside NODE_ENV=production.
const TEST_DB = "file:./test-ratelimit.db";

/* eslint-disable @typescript-eslint/no-explicit-any */
let rl: typeof import("./ratelimit");
let prisma: any;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  process.env.RATE_LIMIT_STORE = "db";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("./prisma"));
  rl = await import("./ratelimit");
}, 60_000);

afterAll(async () => {
  delete process.env.RATE_LIMIT_STORE;
  await prisma?.$disconnect();
  rmSync("test-ratelimit.db", { force: true });
});

describe("rateLimit (db store)", () => {
  it("counts hits in the shared table and blocks past the limit", async () => {
    const t0 = 1_000_000;
    expect(await rl.rateLimit("db-a", 2, 60_000, t0)).toMatchObject({ ok: true, remaining: 1 });
    expect(await rl.rateLimit("db-a", 2, 60_000, t0)).toMatchObject({ ok: true, remaining: 0 });
    const blocked = await rl.rateLimit("db-a", 2, 60_000, t0);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    // The state is IN THE DATABASE (shared across instances), not in memory.
    const row = await prisma.rateLimit.findUnique({ where: { key: "db-a" } });
    expect(Number(row.count)).toBe(3);
  });

  it("starts a fresh window once the old one expires", async () => {
    const t0 = 2_000_000;
    expect((await rl.rateLimit("db-b", 1, 100, t0)).ok).toBe(true);
    expect((await rl.rateLimit("db-b", 1, 100, t0 + 50)).ok).toBe(false); // inside window
    expect((await rl.rateLimit("db-b", 1, 100, t0 + 101)).ok).toBe(true); // expired → reset
    const row = await prisma.rateLimit.findUnique({ where: { key: "db-b" } });
    expect(Number(row.count)).toBe(1);
  });

  it("tracks keys independently", async () => {
    const t0 = 3_000_000;
    expect((await rl.rateLimit("db-c1", 1, 60_000, t0)).ok).toBe(true);
    expect((await rl.rateLimit("db-c1", 1, 60_000, t0)).ok).toBe(false);
    expect((await rl.rateLimit("db-c2", 1, 60_000, t0)).ok).toBe(true);
  });

  it("absorbs concurrent hits atomically (no lost updates)", async () => {
    const t0 = 4_000_000;
    await Promise.all(
      Array.from({ length: 10 }, () => rl.rateLimit("db-concurrent", 100, 60_000, t0)),
    );
    const row = await prisma.rateLimit.findUnique({ where: { key: "db-concurrent" } });
    expect(Number(row.count)).toBe(10); // every hit counted exactly once
  });
});

describe("login lockout (db store)", () => {
  it("locks after 5 failures, persists in the DB, clears on success", async () => {
    const key = "db-lock-a";
    const t0 = 5_000_000;
    for (let i = 0; i < 4; i++) expect((await rl.recordLoginFailure(key, t0)).locked).toBe(false);
    const fifth = await rl.recordLoginFailure(key, t0);
    expect(fifth.locked).toBe(true);
    expect((await rl.loginLockStatus(key, t0)).locked).toBe(true);

    const row = await prisma.loginFailure.findUnique({ where: { key } });
    expect(Number(row.count)).toBe(5);
    expect(Number(row.lockedUntil)).toBeGreaterThan(t0);

    await rl.clearLoginFailures(key);
    expect((await rl.loginLockStatus(key, t0)).locked).toBe(false);
    expect(await prisma.loginFailure.findUnique({ where: { key } })).toBeNull();
  });

  it("grows the lock progressively and caps it at 15 min", async () => {
    const key = "db-lock-b";
    const t0 = 6_000_000;
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await rl.recordLoginFailure(key, t0)).retryAfter;
    expect(last).toBe(15 * 60); // capped
  });

  it("forgets failures older than the 30-min window", async () => {
    const key = "db-lock-c";
    const t0 = 7_000_000;
    for (let i = 0; i < 4; i++) await rl.recordLoginFailure(key, t0);
    expect((await rl.recordLoginFailure(key, t0 + 31 * 60_000)).locked).toBe(false);
    const row = await prisma.loginFailure.findUnique({ where: { key } });
    expect(Number(row.count)).toBe(1); // counter restarted
  });
});

describe("purgeExpiredRateLimits", () => {
  it("removes expired windows and stale failures, keeps live ones", async () => {
    const t0 = 8_000_000;
    await rl.rateLimit("purge-old", 5, 100, t0); // expires at t0+100
    await rl.rateLimit("purge-live", 5, 24 * 3_600_000, t0); // still live at purge time
    await rl.recordLoginFailure("purge-fail-old", t0);
    await rl.recordLoginFailure("purge-fail-live", t0 + 40 * 60_000);

    const res = await rl.purgeExpiredRateLimits(t0 + 35 * 60_000);
    expect(res.rateLimits).toBeGreaterThanOrEqual(1);
    expect(res.loginFailures).toBeGreaterThanOrEqual(1);

    expect(await prisma.rateLimit.findUnique({ where: { key: "purge-old" } })).toBeNull();
    expect(await prisma.rateLimit.findUnique({ where: { key: "purge-live" } })).not.toBeNull();
    expect(await prisma.loginFailure.findUnique({ where: { key: "purge-fail-old" } })).toBeNull();
    expect(await prisma.loginFailure.findUnique({ where: { key: "purge-fail-live" } })).not.toBeNull();
  });
});
