import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";

// Integration test: the co-parent invite endpoint reveals whether an email
// belongs to a Kidora account (404 vs success) — necessary for the invite UX,
// but an account-enumeration oracle if unbounded. It must be rate-limited.
const TEST_DB = "file:./test-guardians-rl.db";

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
let POST: (req: NextRequest) => Promise<Response>;

function addReq(email: string) {
  return new NextRequest("http://localhost/api/guardians", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify({ email }),
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  process.env.AUTH_SECRET = "test-secret-that-is-plenty-long-for-hs256-signing";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  const { signSession } = await import("@/lib/auth");
  ({ POST } = await import("./route"));

  const parent = await prisma.parent.create({ data: { name: "P", email: "inviter@int.dev", passwordHash: "x" } });
  await prisma.child.create({ data: { parentId: parent.id, name: "Kid" } });
  mocks.session.value = await signSession({ parentId: parent.id, email: "inviter@int.dev", tokenVersion: 0 });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-guardians-rl.db", { force: true });
});

describe("/guardians POST rate limit (anti-enumeration)", () => {
  it("stops probing after the hourly cap with a 429", async () => {
    let saw429 = false;
    let probes = 0;
    // Probe distinct non-existent addresses; each would otherwise return a
    // membership-revealing 404. The limiter must cut this off.
    for (let i = 0; i < 15; i++) {
      const res = await POST(addReq(`ghost${i}@nowhere.dev`));
      if (res.status === 429) { saw429 = true; break; }
      expect(res.status).toBe(404); // non-existent account (pre-limit)
      probes++;
    }
    expect(saw429).toBe(true);
    expect(probes).toBeLessThanOrEqual(10); // cap is 10/hour
  });
});
