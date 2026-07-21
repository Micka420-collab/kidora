import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";

// Integration test for the schedule-input hardening on the REAL handlers.
// Locks two footguns out of the API: out-of-range clock values (24:00 / 99:99
// silently became an overnight window on the WRONG day) and empty day lists
// (the engine reads [] as EVERY day, so "uncheck all to disable" armed the
// window 7/7 instead).
const TEST_DB = "file:./test-schedule-validation.db";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mocks = vi.hoisted(() => ({
  session: { value: "" },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kidora_session" ? { value: mocks.session.value } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

let prisma: any;
let screentimePUT: (req: NextRequest, ctx: { params: Promise<{ childId: string }> }) => Promise<Response>;
let routinesPOST: (req: NextRequest, ctx: { params: Promise<{ childId: string }> }) => Promise<Response>;
let childId = "";

function putScreentime(body: unknown) {
  const req = new NextRequest(`http://localhost/api/children/${childId}/screentime`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return screentimePUT(req, { params: Promise.resolve({ childId }) });
}
function postRoutine(body: unknown) {
  const req = new NextRequest(`http://localhost/api/children/${childId}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return routinesPOST(req, { params: Promise.resolve({ childId }) });
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  process.env.AUTH_SECRET = "test-secret-that-is-plenty-long-for-hs256-signing";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  const { signSession } = await import("@/lib/auth");
  ({ PUT: screentimePUT } = await import("./route"));
  ({ POST: routinesPOST } = await import("../routines/route"));

  const parent = await prisma.parent.create({ data: { name: "P", email: "sched@int.dev", passwordHash: "x" } });
  const child = await prisma.child.create({ data: { parentId: parent.id, name: "Kid" } });
  childId = child.id;
  mocks.session.value = await signSession({ parentId: parent.id, email: "sched@int.dev", tokenVersion: 0 });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-schedule-validation.db", { force: true });
});

describe("schedule input validation (integration)", () => {
  it("rejects out-of-range clock values on bedtimes (24:00, 99:99)", async () => {
    for (const start of ["24:00", "99:99", "12:60"]) {
      const res = await putScreentime({ bedtimes: [{ days: ["mon"], start, end: "07:00" }] });
      expect(res.status).toBe(422);
    }
  });

  it("rejects a bedtime with an empty day list", async () => {
    const res = await putScreentime({ bedtimes: [{ days: [], start: "21:00", end: "07:00" }] });
    expect(res.status).toBe(422);
  });

  it("accepts a valid overnight bedtime", async () => {
    const res = await putScreentime({ enabled: true, bedtimes: [{ days: ["mon", "sun"], start: "21:00", end: "07:00" }] });
    expect(res.status).toBe(200);
    const rule = await prisma.screenTimeRule.findUnique({ where: { childId } });
    expect(JSON.parse(rule.bedtimes)).toHaveLength(1);
  });

  it("rejects a routine with bad clock values or no days", async () => {
    const base = { name: "École", blockedAppIds: [] };
    expect((await postRoutine({ ...base, days: ["mon"], start: "24:00", end: "16:00" })).status).toBe(422);
    expect((await postRoutine({ ...base, days: [], start: "08:00", end: "16:00" })).status).toBe(422);
  });

  it("accepts a valid routine", async () => {
    const res = await postRoutine({ name: "École", days: ["mon", "tue"], start: "08:00", end: "16:00", blockedAppIds: [] });
    expect(res.status).toBe(200);
  });
});
