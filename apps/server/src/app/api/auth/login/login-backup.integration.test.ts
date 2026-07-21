import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";

// The login success path sets an httpOnly session cookie via next/headers
// `cookies()`, which needs Next's per-request async store (absent in a plain
// unit test). Stub it so a successful login can complete end-to-end.
vi.mock("next/headers", () => {
  const store = new Map<string, string>();
  return {
    cookies: async () => ({
      set: (name: string, value: string) => store.set(name, value),
      get: (name: string) => (store.has(name) ? { name, value: store.get(name) } : undefined),
      delete: (name: string) => store.delete(name),
    }),
  };
});

// Integration test: drives the REAL /auth/login POST against a temp DB, proving
// a one-time 2FA recovery code can be spent AT MOST once — including under two
// concurrent logins with the same code (the compare-and-swap this test guards).
const TEST_DB = "file:./test-login-backup.db";

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let POST: (req: NextRequest) => Promise<Response>;
let hashPassword: (p: string) => Promise<string>;
let encrypt: (s: string) => string;
let generateSecret: () => string;
let generateBackupCodes: (n?: number) => { codes: string[]; hashes: string[] };

const EMAIL = "backup@int.dev";
const PASSWORD = "correct-horse-battery";

function loginReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let parentId: string;

async function seedParent(): Promise<string[]> {
  const { codes, hashes } = generateBackupCodes(8);
  await prisma.parent.upsert({
    where: { email: EMAIL },
    update: { totpBackupCodes: JSON.stringify(hashes) },
    create: {
      name: "P",
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      totpEnabled: true,
      totpSecret: encrypt(generateSecret()),
      totpBackupCodes: JSON.stringify(hashes),
    },
  });
  const p = await prisma.parent.findUnique({ where: { email: EMAIL } });
  parentId = p.id;
  return codes;
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST } = await import("./route"));
  ({ hashPassword } = await import("@/lib/password"));
  ({ encrypt } = await import("@/lib/crypto"));
  ({ generateSecret } = await import("@/lib/totp"));
  ({ generateBackupCodes } = await import("@/lib/backup-codes"));
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-login-backup.db", { force: true });
});

async function remainingCount(): Promise<number> {
  const p = await prisma.parent.findUnique({ where: { id: parentId } });
  return JSON.parse(p.totpBackupCodes ?? "[]").length;
}

describe("/auth/login backup-code consumption (integration)", () => {
  let codes: string[];
  beforeEach(async () => {
    codes = await seedParent(); // fresh 8 codes each test
  });

  it("accepts a recovery code once, then rejects the same code (consumed)", async () => {
    const first = await POST(loginReq({ email: EMAIL, password: PASSWORD, code: codes[0] }));
    expect(first.status).toBe(200);
    expect(await remainingCount()).toBe(7); // one spent

    const second = await POST(loginReq({ email: EMAIL, password: PASSWORD, code: codes[0] }));
    expect(second.status).toBe(401);
    expect(await remainingCount()).toBe(7); // still 7 — the reused code changes nothing
  });

  it("still accepts a DIFFERENT unused code after one is consumed", async () => {
    expect((await POST(loginReq({ email: EMAIL, password: PASSWORD, code: codes[0] }))).status).toBe(200);
    expect((await POST(loginReq({ email: EMAIL, password: PASSWORD, code: codes[1] }))).status).toBe(200);
    expect(await remainingCount()).toBe(6);
  });

  it("two CONCURRENT logins with the SAME code: exactly one succeeds (no double-spend)", async () => {
    const [a, b] = await Promise.all([
      POST(loginReq({ email: EMAIL, password: PASSWORD, code: codes[2] })),
      POST(loginReq({ email: EMAIL, password: PASSWORD, code: codes[2] })),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 401]); // one wins, one loses — never two 200s
    expect(await remainingCount()).toBe(7); // the code was consumed exactly once
  });

  it("rejects a wrong recovery code without consuming anything", async () => {
    const res = await POST(loginReq({ email: EMAIL, password: PASSWORD, code: "ZZZZ-ZZZZ" }));
    expect(res.status).toBe(401);
    expect(await remainingCount()).toBe(8);
  });
});
