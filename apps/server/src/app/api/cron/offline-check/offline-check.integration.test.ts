import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";

// Integration test for the offline-device sweep against a real temp DB. Locks:
// exactly one alert per outage even under overlapping runs (claim + create are
// now ONE transaction), the muted path claims without alerting, and the push
// is awaited before the response (serverless freeze would drop it mid-flight).
const TEST_DB = "file:./test-offline-check.db";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mocks = vi.hoisted(() => ({
  push: vi.fn(async (..._args: any[]) => { void _args; }),
}));

vi.mock("@/lib/push", () => ({
  sendPushToParent: (...args: any[]) => mocks.push(...args),
}));

let prisma: any;
let GET: (req: NextRequest) => Promise<Response>;
let childId = "";
let parentId = "";

function req(params = "") {
  return new NextRequest(`http://localhost/api/cron/offline-check${params}`, {
    headers: { authorization: "Bearer cron-int-secret" },
  });
}

async function staleDevice(name: string, token: string) {
  return prisma.device.create({
    data: {
      childId,
      name,
      platform: "windows",
      enrollToken: token,
      enrolled: true,
      offlineNotified: false,
      lastSeen: new Date(Date.now() - 48 * 3600_000),
    },
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  process.env.CRON_SECRET = "cron-int-secret";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ GET } = await import("./route"));

  const parent = await prisma.parent.create({ data: { name: "P", email: "offline@int.dev", passwordHash: "x" } });
  parentId = parent.id;
  const child = await prisma.child.create({ data: { parentId, name: "Kid" } });
  childId = child.id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-offline-check.db", { force: true });
});

describe("/cron/offline-check (integration)", () => {
  it("rejects an unauthorized call", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/offline-check"));
    expect(res.status).toBe(401);
  });

  it("two overlapping sweeps create exactly ONE alert and ONE push per outage", async () => {
    await staleDevice("PC silencieux", "offline-int-1");
    mocks.push.mockClear();

    const [a, b] = await Promise.all([GET(req()), GET(req())]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const alerts = await prisma.alert.findMany({ where: { type: "device_offline" } });
    expect(alerts).toHaveLength(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);

    const totals = ((await a.json()) as any).alerted + ((await b.json()) as any).alerted;
    expect(totals).toBe(1);
  });

  it("does not re-alert the same outage on a later sweep", async () => {
    mocks.push.mockClear();
    await GET(req());
    expect(await prisma.alert.count({ where: { type: "device_offline" } })).toBe(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("a muted parent is claimed (no re-fire later) but gets no alert", async () => {
    await prisma.parent.update({ where: { id: parentId }, data: { alertPrefs: JSON.stringify(["device_offline"]) } });
    const d = await staleDevice("Tablette", "offline-int-2");
    mocks.push.mockClear();

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await prisma.alert.count({ where: { type: "device_offline" } })).toBe(1); // unchanged
    expect(mocks.push).not.toHaveBeenCalled();
    const after = await prisma.device.findUnique({ where: { id: d.id } });
    expect(after.offlineNotified).toBe(true); // claimed → un-muting later won't fire a stale alert
  });
});
