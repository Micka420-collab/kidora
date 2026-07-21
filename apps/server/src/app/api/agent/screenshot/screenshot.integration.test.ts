import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";

// Integration test for the screenshot upload path. Locks the hardening: the
// payload must actually BE a PNG/JPEG (magic bytes, not just the data-url
// prefix), and retention is per DEVICE so one device's uploads can no longer
// evict the captures the parent requested from a sibling device.
const TEST_DB = "file:./test-screenshot.db";
const TOKEN_A = "shot-int-a";
const TOKEN_B = "shot-int-b";

// 1x1 transparent PNG.
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let POST: (req: NextRequest) => Promise<Response>;
let deviceA: any;
let deviceB: any;
let childId = "";

function upload(dataUrl: string, token = TOKEN_A) {
  return POST(
    new NextRequest("http://localhost/api/agent/screenshot", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ dataUrl }),
    }),
  );
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST } = await import("./route"));

  const parent = await prisma.parent.create({ data: { name: "P", email: "shot@int.dev", passwordHash: "x" } });
  const child = await prisma.child.create({ data: { parentId: parent.id, name: "Kid" } });
  childId = child.id;
  deviceA = await prisma.device.create({
    data: { childId, name: "Téléphone", platform: "android", enrollToken: TOKEN_A, enrolled: true },
  });
  deviceB = await prisma.device.create({
    data: { childId, name: "PC", platform: "windows", enrollToken: TOKEN_B, enrolled: true },
  });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-screenshot.db", { force: true });
});

describe("/agent/screenshot (integration)", () => {
  it("accepts a real PNG", async () => {
    const res = await upload(`data:image/png;base64,${TINY_PNG}`);
    expect(res.status).toBe(200);
  });

  it("rejects junk that only has the data-url prefix (422)", async () => {
    const junk = Buffer.from("ceci n'est pas une image".repeat(10)).toString("base64");
    expect((await upload(`data:image/png;base64,${junk}`)).status).toBe(422);
    // Declared JPEG carrying PNG bytes → mismatch is refused too.
    expect((await upload(`data:image/jpeg;base64,${TINY_PNG}`)).status).toBe(422);
  });

  it("retention is per device: device A's uploads never evict device B's captures", async () => {
    // Fill device A to its cap and give device B a few captures, directly in DB.
    await prisma.screenshot.deleteMany({ where: { childId } });
    for (let i = 0; i < 20; i++) {
      await prisma.screenshot.create({
        data: { childId, deviceId: deviceA.id, dataUrl: `a-${i}`, createdAt: new Date(Date.now() - (100 - i) * 60_000) },
      });
    }
    for (let i = 0; i < 3; i++) {
      await prisma.screenshot.create({
        data: { childId, deviceId: deviceB.id, dataUrl: `b-${i}`, createdAt: new Date(Date.now() - (200 + i) * 60_000) },
      });
    }

    const res = await upload(`data:image/png;base64,${TINY_PNG}`); // device A again
    expect(res.status).toBe(200);

    // Device A pruned to 20 (oldest dropped), device B untouched — under the
    // old per-CHILD cap, B's older captures would have been evicted instead.
    expect(await prisma.screenshot.count({ where: { deviceId: deviceA.id } })).toBe(20);
    expect(await prisma.screenshot.count({ where: { deviceId: deviceB.id } })).toBe(3);
    expect(await prisma.screenshot.findFirst({ where: { deviceId: deviceA.id, dataUrl: "a-0" } })).toBeNull();
  });
});
