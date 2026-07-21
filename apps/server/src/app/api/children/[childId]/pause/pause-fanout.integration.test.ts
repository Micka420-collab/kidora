import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";

// Integration test: pause/resume must FAN OUT one command row per device. A
// single null-device row is consumed by whichever device syncs first, leaving
// the child's other devices paused/locked forever (multi-device family bug).
const TEST_DB = "file:./test-pause-fanout.db";

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
let POST: (req: NextRequest, ctx: { params: Promise<{ childId: string }> }) => Promise<Response>;
let familyPOST: (req: NextRequest) => Promise<Response>;
let childId = "";
let deviceA = "";
let deviceB = "";

function pauseReq(body: unknown) {
  const req = new NextRequest(`http://localhost/api/children/${childId}/pause`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ childId }) });
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  process.env.AUTH_SECRET = "test-secret-that-is-plenty-long-for-hs256-signing";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  const { signSession } = await import("@/lib/auth");
  ({ POST } = await import("./route"));
  ({ POST: familyPOST } = await import("../../../family/pause/route"));

  const parent = await prisma.parent.create({ data: { name: "P", email: "fanout@int.dev", passwordHash: "x" } });
  const child = await prisma.child.create({ data: { parentId: parent.id, name: "Kid" } });
  childId = child.id;
  const a = await prisma.device.create({ data: { childId, name: "Téléphone", platform: "android", enrollToken: "fanout-a", enrolled: true } });
  const b = await prisma.device.create({ data: { childId, name: "PC", platform: "windows", enrollToken: "fanout-b", enrolled: true } });
  deviceA = a.id;
  deviceB = b.id;
  mocks.session.value = await signSession({ parentId: parent.id, email: "fanout@int.dev", tokenVersion: 0 });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-pause-fanout.db", { force: true });
});

describe("pause/resume command fan-out (integration)", () => {
  it("pause creates one command row per device (not a single null-device row)", async () => {
    const res = await pauseReq({ paused: true });
    expect(res.status).toBe(200);

    const cmds = await prisma.command.findMany({ where: { childId, type: "pause" } });
    expect(cmds).toHaveLength(2);
    expect(cmds.map((c: any) => c.deviceId).sort()).toEqual([deviceA, deviceB].sort());
    expect(cmds.every((c: any) => c.deviceId !== null)).toBe(true);
  });

  it("resume also reaches every device", async () => {
    const res = await pauseReq({ paused: false });
    expect(res.status).toBe(200);
    const cmds = await prisma.command.findMany({ where: { childId, type: "resume" } });
    expect(cmds).toHaveLength(2);
    expect(cmds.map((c: any) => c.deviceId).sort()).toEqual([deviceA, deviceB].sort());
  });

  it("family pause fans out per device for every child", async () => {
    await prisma.command.deleteMany({ where: { childId } });
    const res = await familyPOST(
      new NextRequest("http://localhost/api/family/pause", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused: true }),
      }),
    );
    expect(res.status).toBe(200);
    const cmds = await prisma.command.findMany({ where: { childId, type: "pause" } });
    expect(cmds).toHaveLength(2);
    expect(cmds.every((c: any) => c.deviceId !== null)).toBe(true);
  });
});
