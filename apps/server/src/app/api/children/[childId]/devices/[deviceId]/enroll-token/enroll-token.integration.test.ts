import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";

// Integration test for enrollment-token regeneration through the REAL POST
// handler + a real temp DB. Locks the contract: a parent can re-arm a
// never-enrolled device with a FRESH token (new value + new deadline), but an
// enrolled device's token — the agent's live credential — is never rotated.
const TEST_DB = "file:./test-enroll-token.db";

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
let POST: (req: NextRequest, ctx: { params: Promise<{ childId: string; deviceId: string }> }) => Promise<Response>;
let childId = "";

function call(deviceId: string, cid = childId) {
  const req = new NextRequest(`http://localhost/api/children/${cid}/devices/${deviceId}/enroll-token`, { method: "POST" });
  return POST(req, { params: Promise.resolve({ childId: cid, deviceId }) });
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  process.env.AUTH_SECRET = "test-secret-that-is-plenty-long-for-hs256-signing";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  const { signSession } = await import("@/lib/auth");
  ({ POST } = await import("./route"));

  const parent = await prisma.parent.create({ data: { name: "P", email: "regen@int.dev", passwordHash: "x" } });
  const child = await prisma.child.create({ data: { parentId: parent.id, name: "Kid" } });
  childId = child.id;
  mocks.session.value = await signSession({ parentId: parent.id, email: "regen@int.dev", tokenVersion: 0 });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-enroll-token.db", { force: true });
});

describe("/children/:childId/devices/:deviceId/enroll-token", () => {
  it("issues a fresh token + deadline for a never-enrolled device", async () => {
    const device = await prisma.device.create({
      data: {
        childId,
        name: "PC",
        platform: "windows",
        enrollToken: "regen-old-token",
        enrolled: false,
        enrollTokenExpiresAt: new Date(Date.now() - 1000), // expired
      },
    });

    const res = await call(device.id);
    expect(res.status).toBe(200);
    const { device: updated } = (await res.json()) as any;
    expect(updated.enrollToken).not.toBe("regen-old-token");
    expect(new Date(updated.enrollTokenExpiresAt).getTime()).toBeGreaterThan(Date.now());

    // The old token is gone from the DB — a leaked ZIP stays dead.
    expect(await prisma.device.findUnique({ where: { enrollToken: "regen-old-token" } })).toBeNull();
  });

  it("refuses to rotate an enrolled device's live credential (409)", async () => {
    const device = await prisma.device.create({
      data: { childId, name: "Actif", platform: "windows", enrollToken: "regen-live-token", enrolled: true },
    });
    const res = await call(device.id);
    expect(res.status).toBe(409);
    const after = await prisma.device.findUnique({ where: { id: device.id } });
    expect(after.enrollToken).toBe("regen-live-token"); // untouched
  });

  it("404s on a device that doesn't belong to the child", async () => {
    const res = await call("nonexistent-device-id");
    expect(res.status).toBe(404);
  });
});
