import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Integration test: logout must REVOKE the session server-side, not just drop
// the cookie. The JWT is stateless, issued for 30 days, and handed to mobile
// clients in cleartext — so a leaked token stayed fully valid after "logout".
// Bumping tokenVersion makes getCurrentParent reject every outstanding token.
const TEST_DB = "file:./test-logout.db";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mocks = vi.hoisted(() => ({
  session: { value: "" },
  cleared: { value: false },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kidora_session" ? { value: mocks.session.value } : undefined),
    set: () => {},
    delete: () => { mocks.cleared.value = true; },
  }),
}));

let prisma: any;
let logoutPOST: () => Promise<Response>;
let getCurrentParent: () => Promise<any>;
let signSession: (p: any) => Promise<string>;
let parentId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  process.env.AUTH_SECRET = "test-secret-that-is-plenty-long-for-hs256-signing";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ getCurrentParent, signSession } = await import("@/lib/auth"));
  ({ POST: logoutPOST } = await import("./route"));

  const parent = await prisma.parent.create({ data: { name: "P", email: "logout@int.dev", passwordHash: "x", tokenVersion: 0 } });
  parentId = parent.id;
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-logout.db", { force: true });
});

describe("/auth/logout (integration)", () => {
  it("bumps tokenVersion and clears the cookie, invalidating the outstanding token", async () => {
    mocks.session.value = await signSession({ parentId, email: "logout@int.dev", tokenVersion: 0 });
    // Sanity: the token is valid before logout.
    expect((await getCurrentParent())?.id).toBe(parentId);

    const res = await logoutPOST();
    expect(res.status).toBe(200);
    expect(mocks.cleared.value).toBe(true);

    const after = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(after.tokenVersion).toBe(1);

    // The SAME token (as a mobile client would replay it) is now rejected.
    expect(await getCurrentParent()).toBeNull();
  });

  it("is a no-op that still 200s when there is no valid session", async () => {
    mocks.session.value = ""; // no cookie
    const res = await logoutPOST();
    expect(res.status).toBe(200);
    const after = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(after.tokenVersion).toBe(1); // unchanged
  });
});
