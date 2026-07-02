import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
import { NextRequest } from "next/server";

// Integration test for the signed self-update endpoint: it must require device
// auth, and the bundle it returns must carry a signature that verifies against
// the server's pinned public key with a content hash bound to the files.
const TEST_DB = "file:./test-bundle.db";
const TOKEN = "int-bundle-token";

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let GET: (req: NextRequest) => Promise<Response>;
let policyPublicKeyBase64: () => string;
let bundleHash: (files: Record<string, string>) => string;

function req(token?: string): NextRequest {
  return new NextRequest("http://localhost/api/agent/bundle", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  process.env.POLICY_SIGNING_SEED = "bundle-int-seed";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ GET } = await import("./route"));
  ({ policyPublicKeyBase64, bundleHash } = await import("@/lib/policy-sign"));

  const parent = await prisma.parent.create({ data: { name: "P", email: "bundle@int.dev", passwordHash: "x" } });
  const child = await prisma.child.create({ data: { parentId: parent.id, name: "Kid" } });
  await prisma.device.create({
    data: { childId: child.id, name: "PC", platform: "windows", enrollToken: TOKEN, lastSeen: new Date() },
  });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-bundle.db", { force: true });
});

describe("/api/agent/bundle (integration)", () => {
  it("rejects an unauthenticated request", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("wrong-token"))).status).toBe(401);
  });

  it("returns a bundle whose signature verifies and whose hash binds the files", async () => {
    const res = await GET(req(TOKEN));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: string; signed: string; sig: string; files: Record<string, string> };

    // The agent's verification path: import the pinned key, verify the signature.
    const pub = createPublicKey({ key: Buffer.from(policyPublicKeyBase64(), "base64"), format: "der", type: "spki" });
    expect(verify(null, Buffer.from(body.signed, "utf8"), pub, Buffer.from(body.sig, "base64"))).toBe(true);

    // The signed manifest hash must match the delivered files (no file can be swapped).
    const manifest = JSON.parse(body.signed) as { v: string; h: string };
    expect(manifest.v).toBe(body.version);
    expect(manifest.h).toBe(bundleHash(body.files));
    // The bundle actually contains the agent entrypoint.
    expect(Object.keys(body.files)).toContain("agent.js");
  });
});
