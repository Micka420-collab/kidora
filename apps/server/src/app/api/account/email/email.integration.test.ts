import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";

// Integration test for the email-change flow through the REAL handlers + a real
// temp DB. Locks the double opt-in contract: requesting a change parks the new
// address in `pendingEmail` and the ACTIVE address only switches once the new
// mailbox confirms via /verify-email — so a typo (or a hostile change) can
// neither lock the parent out nor squat an address they don't control. With no
// SMTP there is no verification path, so the switch stays immediate.
//
// `requireParent` reads the `kidora_session` JWT via next/headers, so we mock
// next/headers to present a session we sign with the real signSession, and mock
// the mailer to avoid real SMTP. Everything else is real.
const TEST_DB = "file:./test-email.db";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mocks = vi.hoisted(() => ({
  session: { value: "" }, // set to a real signed JWT in beforeAll
  mailConfigured: { value: true }, // toggled per test
  sendMail: vi.fn(async (opts: any) => { void opts; }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kidora_session" ? { value: mocks.session.value } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

vi.mock("@/lib/mailer", () => ({
  isMailConfigured: () => mocks.mailConfigured.value,
  sendMail: (opts: any) => mocks.sendMail(opts),
}));

let prisma: any;
let POST: (req: NextRequest) => Promise<Response>;
let DELETE: () => Promise<Response>;
let verifyGET: (req: NextRequest) => Promise<Response>;
let resendPOST: (req: NextRequest) => Promise<Response>;
let parentId = "";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/account/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function verifyReq(token: string): NextRequest {
  return new NextRequest(`http://localhost/api/auth/verify-email?token=${token}`);
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  process.env.AUTH_SECRET = "test-secret-that-is-plenty-long-for-hs256-signing";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  const { hashPassword } = await import("@/lib/password");
  const { signSession } = await import("@/lib/auth");
  ({ POST, DELETE } = await import("./route"));
  ({ GET: verifyGET } = await import("../../auth/verify-email/route"));
  ({ POST: resendPOST } = await import("../resend-verification/route"));

  const parent = await prisma.parent.create({
    data: { name: "Parent", email: "old@ex.dev", passwordHash: await hashPassword("Sup3rSecret!"), emailVerified: true },
  });
  parentId = parent.id;
  mocks.session.value = await signSession({ parentId, email: "old@ex.dev", tokenVersion: 0 });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-email.db", { force: true });
});

describe("/account/email (double opt-in)", () => {
  it("parks the new address in pendingEmail and keeps the active email unchanged", async () => {
    mocks.mailConfigured.value = true;
    mocks.sendMail.mockClear();

    const res = await POST(req({ currentPassword: "Sup3rSecret!", email: "new@ex.dev" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).verificationRequired).toBe(true);

    const p = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(p.email).toBe("old@ex.dev"); // ACTIVE address untouched
    expect(p.emailVerified).toBe(true); // still verified on the active address
    expect(p.pendingEmail).toBe("new@ex.dev");
    expect(p.emailVerifyToken).toBeTruthy();

    // Confirm link to the NEW mailbox + heads-up to the CURRENT one.
    expect(mocks.sendMail).toHaveBeenCalledTimes(2);
    const to = mocks.sendMail.mock.calls.map((c: any) => c[0].to).sort();
    expect(to).toEqual(["new@ex.dev", "old@ex.dev"]);
  });

  it("resend-verification targets the pending mailbox while a change is pending", async () => {
    mocks.sendMail.mockClear();
    const res = await resendPOST(new NextRequest("http://localhost/api/account/resend-verification", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).alreadyVerified).toBeUndefined();
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail.mock.calls[0][0].to).toBe("new@ex.dev");
  });

  it("confirming from the new mailbox applies the switch atomically", async () => {
    const { emailVerifyToken } = await prisma.parent.findUnique({ where: { id: parentId } });
    const res = await verifyGET(verifyReq(emailVerifyToken));
    expect(res.headers.get("location")).toContain("verified=1");

    const p = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(p.email).toBe("new@ex.dev"); // switched only now
    expect(p.emailVerified).toBe(true);
    expect(p.pendingEmail).toBeNull();
    expect(p.emailVerifyToken).toBeNull();
  });

  it("rejects a wrong password (403) and does not park anything", async () => {
    mocks.sendMail.mockClear();
    const res = await POST(req({ currentPassword: "wrong-password", email: "evil@ex.dev" }));
    expect(res.status).toBe(403);
    const p = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(p.email).toBe("new@ex.dev");
    expect(p.pendingEmail).toBeNull();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("DELETE cancels a pending change without touching the active address", async () => {
    await POST(req({ currentPassword: "Sup3rSecret!", email: "typo@ex.dev" }));
    let p = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(p.pendingEmail).toBe("typo@ex.dev");

    const res = await DELETE();
    expect(res.status).toBe(200);
    p = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(p.pendingEmail).toBeNull();
    expect(p.emailVerifyToken).toBeNull();
    expect(p.email).toBe("new@ex.dev"); // unchanged
  });

  it("loses the race gracefully when the pending address gets registered meanwhile", async () => {
    await POST(req({ currentPassword: "Sup3rSecret!", email: "raced@ex.dev" }));
    // Someone registers raced@ex.dev before the parent clicks the link.
    await prisma.parent.create({ data: { name: "Other", email: "raced@ex.dev", passwordHash: "x" } });

    const { emailVerifyToken } = await prisma.parent.findUnique({ where: { id: parentId } });
    const res = await verifyGET(verifyReq(emailVerifyToken));
    expect(res.headers.get("location")).toContain("verified=0");

    const p = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(p.email).toBe("new@ex.dev"); // still on the stable active address
    expect(p.pendingEmail).toBeNull(); // pending change dropped
  });

  it("switches immediately when SMTP is NOT configured (no verification path)", async () => {
    mocks.mailConfigured.value = false;
    mocks.sendMail.mockClear();

    const res = await POST(req({ currentPassword: "Sup3rSecret!", email: "third@ex.dev" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).verificationRequired).toBe(false);

    const p = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(p.email).toBe("third@ex.dev");
    expect(p.emailVerified).toBe(true); // no SMTP → nothing to verify against
    expect(p.pendingEmail).toBeNull();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
