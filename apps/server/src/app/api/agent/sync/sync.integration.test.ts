import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";

// Integration test: drives the REAL /agent/sync POST handler end-to-end against a
// temporary DB, locking the safety behaviours hardened this session — a muted
// "keyword" category must NOT silence a critical (self-harm) keyword hit, and
// pending commands must be delivered + marked. Auth is a Bearer enrollToken.
const TEST_DB = "file:./test-sync.db";
const TOKEN = "int-device-token";

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let POST: (req: NextRequest) => Promise<Response>;
let childId: string;

function syncReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/agent/sync", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST } = await import("./route"));

  // Parent has MUTED the "keyword" category.
  const parent = await prisma.parent.create({
    data: { name: "P", email: "sync@int.dev", passwordHash: "x", alertPrefs: JSON.stringify(["keyword"]) },
  });
  const child = await prisma.child.create({ data: { parentId: parent.id, name: "Kid" } });
  childId = child.id;
  await prisma.device.create({
    data: { childId: child.id, name: "PC", platform: "windows", enrollToken: TOKEN, lastSeen: new Date() },
  });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync("test-sync.db", { force: true });
});

describe("/agent/sync (integration)", () => {
  it("keeps a CRITICAL keyword alert even when the parent muted 'keyword', but drops the warning one", async () => {
    const res = await POST(
      syncReq({
        events: [
          { type: "search", title: "comment mourir", detail: "" }, // automutilation → critical
          { type: "search", title: "porn gratuit", detail: "" }, //     adulte        → warning (muted)
        ],
      }),
    );
    expect(res.status).toBe(200);

    const alerts = await prisma.alert.findMany({ where: { childId, type: "keyword" } });
    const messages = alerts.map((a: any) => a.message).join(" | ");
    // critical self-harm keyword survived the mute:
    expect(alerts.some((a: any) => a.severity === "critical")).toBe(true);
    expect(messages).toContain("automutilation");
    // the warning-level 'adulte' keyword was muted away:
    expect(messages).not.toContain("adulte");
    expect(alerts.every((a: any) => a.severity !== "warning")).toBe(true);
  });

  it("delivers a pending command and marks it delivered", async () => {
    const cmd = await prisma.command.create({
      data: { childId, type: "lock", payload: "{}", status: "pending" },
    });
    const res = await POST(syncReq({ online: true }));
    const data = (await res.json()) as { commands: { id: string; type: string }[] };

    expect(data.commands.some((c) => c.id === cmd.id && c.type === "lock")).toBe(true);
    const after = await prisma.command.findUnique({ where: { id: cmd.id } });
    expect(after.status).toBe("delivered");
  });

  it("does NOT consume commands when deliverCommands is false (background sync)", async () => {
    const cmd = await prisma.command.create({
      data: { childId, type: "message", payload: JSON.stringify({ text: "hi" }), status: "pending" },
    });
    const res = await POST(syncReq({ online: true, deliverCommands: false }));
    const data = (await res.json()) as { commands: { id: string }[] };

    expect(data.commands.some((c) => c.id === cmd.id)).toBe(false);
    const after = await prisma.command.findUnique({ where: { id: cmd.id } });
    expect(after.status).toBe("pending"); // untouched, waits for a full sync
  });
});
