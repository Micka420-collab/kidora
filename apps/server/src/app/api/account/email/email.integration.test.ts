import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";

// Integration test for the account email-change route through the REAL POST
// handler + a real temp DB. Locks the security behaviour: changing the account
// email re-opens verification (the new mailbox must be confirmed) when SMTP is
// configured, and stays auto-verified when it isn't — so the "verified" flag can
// never claim an address the parent doesn't actually control.
//
// This is the first cookie-session route test: `requireParent` reads the
// `kidora_session` JWT via next/headers, so we mock next/headers to present a
// session we sign with the real signSession, and mock the mailer to avoid real
// SMTP. Everything else (auth verify, password check, prisma writes) is real.
const TEST_DB = "file:./test-email.db";

const mocks = vi.hoisted(() => ({
  session: { value: "" }, // set to a real signed JWT in beforeAll
  mailConfigured: { value: true }, // toggled per test
  sendMail: vi.fn(async () => {}),
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
  sendMail: (...args: unknown[]) => mocks.sendMail(...(args as [])),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let POST: (req: NextRequest) => Promise<Response>;
let parentId = "";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/account/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  process.env.AUTH_SECRET = "test-secret-that-is-plenty-long-for-hs256-signing";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  const { hashPassword } = await import("@/lib/password");
  const { signSession } = await import("@/lib/auth");
  ({ POST } = await import("./route"));

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

describe("/account/email", () => {
  it("re-opens verification + emails the new address when SMTP is configured", async () => {
    mocks.mailConfigured.value = true;
    mocks.sendMail.mockClear();

    const res = await POST(req({ currentPassword: "Sup3rSecret!", email: "new@ex.dev" }));
    expect(res.status).toBe(200);

    const p = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(p.email).toBe("new@ex.dev");
    expect(p.emailVerified).toBe(false); // the new mailbox must be confirmed
    expect(p.emailVerifyToken).toBeTruthy();
    expect(p.emailVerifyTokenExpiry).toBeTruthy();
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect((mocks.sendMail.mock.calls[0][0] as any).to).toBe("new@ex.dev");
  });

  it("rejects a wrong password (403) and does not change the email", async () => {
    mocks.sendMail.mockClear();
    const res = await POST(req({ currentPassword: "wrong-password", email: "evil@ex.dev" }));
    expect(res.status).toBe(403);

    const p = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(p.email).toBe("new@ex.dev"); // unchanged
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("stays auto-verified when SMTP is NOT configured (no verification path)", async () => {
    mocks.mailConfigured.value = false;
    mocks.sendMail.mockClear();
    await prisma.parent.update({ where: { id: parentId }, data: { emailVerified: true } });

    const res = await POST(req({ currentPassword: "Sup3rSecret!", email: "third@ex.dev" }));
    expect(res.status).toBe(200);

    const p = await prisma.parent.findUnique({ where: { id: parentId } });
    expect(p.email).toBe("third@ex.dev");
    expect(p.emailVerified).toBe(true); // no SMTP → nothing to verify against
    expect(p.emailVerifyToken).toBeNull();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
