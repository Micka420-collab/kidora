import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Integration test for the weekly-report sender against a real temp DB. Locks
// the overlap contract: two concurrent runs (cron retry + manual trigger) must
// produce exactly ONE email per parent (atomic claim on lastWeeklyReportAt),
// and a transient SMTP failure must RELEASE the claim so the next run retries
// instead of silencing the parent for a whole week.
const TEST_DB = "file:./test-report-mailer.db";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(async (opts: any) => { void opts; }),
}));

vi.mock("@/lib/mailer", () => ({
  isMailConfigured: () => true,
  sendMail: (opts: any) => mocks.sendMail(opts),
}));

let prisma: any;
let sendWeeklyReports: (opts?: { days?: number; dryRun?: boolean }) => Promise<any>;
let parentId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ sendWeeklyReports } = await import("./report-mailer"));

  const parent = await prisma.parent.create({
    data: { name: "P", email: "weekly@int.dev", passwordHash: "x", weeklyReportEmail: true },
  });
  parentId = parent.id;
  const child = await prisma.child.create({ data: { parentId, name: "Kid" } });
  const device = await prisma.device.create({
    data: { childId: child.id, name: "PC", platform: "windows", enrollToken: "weekly-int-token", enrolled: true },
  });
  // Activity today (UTC local-day — tzOffsetMinutes defaults to 0) so the
  // parent passes the hasActivity gate.
  await prisma.appUsage.create({
    data: {
      childId: child.id,
      deviceId: device.id,
      appId: "chrome.exe",
      appName: "Chrome",
      date: new Date().toISOString().slice(0, 10),
      seconds: 1200,
    },
  });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-report-mailer.db", { force: true });
});

describe("sendWeeklyReports (integration)", () => {
  it("two overlapping runs send exactly ONE email (atomic claim)", async () => {
    mocks.sendMail.mockClear();
    const [a, b] = await Promise.all([sendWeeklyReports(), sendWeeklyReports()]);

    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(a.sent + b.sent).toBe(1);
    expect(a.skippedAlreadySent + b.skippedAlreadySent).toBe(1);

    const p = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(p.lastWeeklyReportAt).not.toBeNull();
  });

  it("a later run within the window skips without re-emailing", async () => {
    mocks.sendMail.mockClear();
    const s = await sendWeeklyReports();
    expect(s.sent).toBe(0);
    expect(s.skippedAlreadySent).toBe(1);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("a transient SMTP failure releases the claim so the next run retries", async () => {
    await prisma.parent.update({ where: { id: parentId }, data: { lastWeeklyReportAt: null } });
    mocks.sendMail.mockClear();
    mocks.sendMail.mockRejectedValueOnce(new Error("smtp down"));

    const errRun = await sendWeeklyReports();
    expect(errRun.errors).toBe(1);
    expect(errRun.sent).toBe(0);
    // Claim released → still eligible.
    const p = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(p.lastWeeklyReportAt).toBeNull();

    const retry = await sendWeeklyReports();
    expect(retry.sent).toBe(1);
    expect(mocks.sendMail).toHaveBeenCalledTimes(2); // 1 failed + 1 success
  });
});
