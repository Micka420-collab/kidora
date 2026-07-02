import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
import { NextRequest } from "next/server";

// Integration test: the device-enrollment onboarding path through the real POST
// handler — a valid token enrolls the device and returns its policy; an invalid
// token is rejected. Locks the agent↔server enroll contract server-side.
const TEST_DB = "file:./test-enroll.db";
const TOKEN = "enroll-int-token";

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let POST: (req: NextRequest) => Promise<Response>;
let deviceId: string;
let childId: string;

function enrollReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/agent/enroll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST } = await import("./route"));

  const parent = await prisma.parent.create({ data: { name: "P", email: "enroll@int.dev", passwordHash: "x" } });
  const child = await prisma.child.create({ data: { parentId: parent.id, name: "Kid" } });
  childId = child.id;
  const device = await prisma.device.create({
    data: { childId: child.id, name: "PC", platform: "windows", enrollToken: TOKEN, enrolled: false },
  });
  deviceId = device.id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-enroll.db", { force: true });
});

describe("/agent/enroll (integration)", () => {
  it("enrolls a device with a valid token and returns its policy", async () => {
    const res = await POST(enrollReq({ enrollToken: TOKEN, deviceInfo: { model: "ThinkPad", agentVersion: "9.9.9" } }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.deviceId).toBe(deviceId);
    expect(data.childId).toBe(childId);
    expect(data.childName).toBe("Kid");
    expect(data.policy).toBeTruthy();
    expect(typeof data.syncIntervalSeconds).toBe("number");

    const after = await prisma.device.findUnique({ where: { id: deviceId } });
    expect(after.enrolled).toBe(true);
    expect(after.lastSeen).not.toBeNull(); // set at enroll → offline-check can't false-positive
    expect(after.model).toBe("ThinkPad");
    expect(after.agentVersion).toBe("9.9.9");
  });

  it("returns a pinnable public key + a signed policy envelope the agent can verify", async () => {
    const res = await POST(enrollReq({ enrollToken: TOKEN, deviceInfo: {} }));
    const data = (await res.json()) as any;
    // The agent pins policyPublicKey and verifies policySigned/policySig on enroll.
    expect(typeof data.policyPublicKey).toBe("string");
    expect(typeof data.policySigned).toBe("string");
    expect(typeof data.policySig).toBe("string");
    const pub = createPublicKey({ key: Buffer.from(data.policyPublicKey, "base64"), format: "der", type: "spki" });
    expect(verify(null, Buffer.from(data.policySigned, "utf8"), pub, Buffer.from(data.policySig, "base64"))).toBe(true);
    // The signed envelope is bound to THIS child (an agent rejects a mismatch).
    const env = JSON.parse(data.policySigned);
    expect(env.cid).toBe(childId);
    expect(typeof env.iat).toBe("number");
  });

  it("rejects an unknown enroll token with 401", async () => {
    const res = await POST(enrollReq({ enrollToken: "not-a-real-token", deviceInfo: {} }));
    expect(res.status).toBe(401);
  });

  it("rejects a malformed body with 422", async () => {
    const res = await POST(enrollReq({ deviceInfo: {} })); // no enrollToken
    expect(res.status).toBe(422);
  });
});
