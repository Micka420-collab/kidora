import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";

// Integration test: the parent sign-in path through the real POST handler.
// Locks the security contract: correct credentials mint a session cookie + token,
// wrong credentials / unknown accounts are rejected identically (no enumeration),
// 2FA-enabled accounts are gated, and repeated failures trip the progressive lock.
const TEST_DB = "file:./test-login.db";
const PASSWORD = "correct-horse-battery";

// The route sets an httpOnly session cookie via next/headers `cookies()`, which
// has no request scope in a direct-handler test — mock it with an in-memory jar
// so we can also assert a session was actually established.
const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (cookieStore.has(n) ? { name: n, value: cookieStore.get(n) } : undefined),
    set: (n: string, value: string) => void cookieStore.set(n, value),
    delete: (n: string) => void cookieStore.delete(n),
  }),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let POST: (req: NextRequest) => Promise<Response>;

// Each case uses its own client IP so per-IP rate-limit and per-(email+IP) lock
// state never bleeds between tests.
function loginReq(body: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  const { hashPassword } = await import("@/lib/password");
  ({ POST } = await import("./route"));

  await prisma.parent.create({
    data: { name: "Alice", email: "login@int.dev", passwordHash: await hashPassword(PASSWORD) },
  });
  // A 2FA-enabled account: totpSecret is opaque here — the "code required" gate
  // fires before any decrypt, so the value only needs to be non-null.
  await prisma.parent.create({
    data: {
      name: "Bob",
      email: "2fa@int.dev",
      passwordHash: await hashPassword(PASSWORD),
      totpEnabled: true,
      totpSecret: "opaque-secret-blob",
    },
  });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-login.db", { force: true });
});

describe("/auth/login (integration)", () => {
  it("signs in with correct credentials, minting a session cookie + token", async () => {
    cookieStore.clear();
    const res = await POST(loginReq({ email: "login@int.dev", password: PASSWORD }, "10.0.0.1"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.email).toBe("login@int.dev");
    expect(data.name).toBe("Alice");
    expect(typeof data.token).toBe("string");
    expect(data.token.length).toBeGreaterThan(20);
    expect(cookieStore.get("kidora_session")).toBe(data.token); // session actually established
  });

  it("is case-insensitive on the email", async () => {
    const res = await POST(loginReq({ email: "LOGIN@INT.DEV", password: PASSWORD }, "10.0.0.2"));
    expect(res.status).toBe(200);
  });

  it("rejects a wrong password with 401 and sets no cookie", async () => {
    cookieStore.clear();
    const res = await POST(loginReq({ email: "login@int.dev", password: "wrong" }, "10.0.0.3"));
    expect(res.status).toBe(401);
    expect(cookieStore.has("kidora_session")).toBe(false);
  });

  it("rejects an unknown account with the same 401 (no user enumeration)", async () => {
    const res = await POST(loginReq({ email: "nobody@int.dev", password: PASSWORD }, "10.0.0.4"));
    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data.error).toBe("Email ou mot de passe incorrect"); // identical to wrong-password
  });

  it("rejects a malformed body (bad email) with 422", async () => {
    const res = await POST(loginReq({ email: "not-an-email", password: PASSWORD }, "10.0.0.5"));
    expect(res.status).toBe(422);
  });

  it("gates a 2FA account: correct password without a code returns twoFactor 401", async () => {
    const res = await POST(loginReq({ email: "2fa@int.dev", password: PASSWORD }, "10.0.0.6"));
    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data.twoFactor).toBe(true);
  });

  it("progressively locks the account after repeated failures (429)", async () => {
    const ip = "10.0.0.7";
    // First 5 wrong attempts are answered 401; they accrue toward the threshold.
    for (let i = 0; i < 5; i++) {
      const r = await POST(loginReq({ email: "login@int.dev", password: "nope" }, ip));
      expect(r.status).toBe(401);
    }
    // The 6th is refused up-front by the lock — even with the *correct* password.
    const locked = await POST(loginReq({ email: "login@int.dev", password: PASSWORD }, ip));
    expect(locked.status).toBe(429);
    expect(locked.headers.get("Retry-After")).toBeTruthy();
  });
});
