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
const RL_TOKEN = "int-rl-token";

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
  // Separate device for the rate-limit test → its own in-memory bucket, so
  // hammering it can't exhaust the shared device's budget used by other tests.
  await prisma.device.create({
    data: { childId: child.id, name: "RL", platform: "windows", enrollToken: RL_TOKEN, lastSeen: new Date() },
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

  it("redelivers a stale 'delivered' command that was never acknowledged", async () => {
    const prev = process.env.COMMAND_REDELIVER_MINUTES;
    process.env.COMMAND_REDELIVER_MINUTES = "0"; // any delivered command is stale → requeue
    try {
      // A command already marked delivered (agent got it, then crashed before acking).
      const cmd = await prisma.command.create({
        data: { childId, type: "lock", payload: "{}", status: "delivered" },
      });
      const res = await POST(syncReq({ online: true }));
      const data = (await res.json()) as { commands: { id: string }[] };
      // It is delivered AGAIN instead of being lost forever.
      expect(data.commands.some((c) => c.id === cmd.id)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.COMMAND_REDELIVER_MINUTES;
      else process.env.COMMAND_REDELIVER_MINUTES = prev;
    }
  });

  it("does NOT redeliver a freshly delivered command within the grace window", async () => {
    // Default grace (10 min): a just-delivered command must NOT be redelivered.
    const cmd = await prisma.command.create({
      data: { childId, type: "lock", payload: "{}", status: "delivered" },
    });
    const res = await POST(syncReq({ online: true }));
    const data = (await res.json()) as { commands: { id: string }[] };
    expect(data.commands.some((c) => c.id === cmd.id)).toBe(false); // still in flight, not re-sent
  });

  it("rate-limits a device flooding /agent/sync (leaked-token protection)", async () => {
    const req = () =>
      new NextRequest("http://localhost/api/agent/sync", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${RL_TOKEN}` },
        body: JSON.stringify({ online: true }),
      });
    // The limit is 40/min per device. Send 40 (all OK) then one more (429).
    let last = 200;
    for (let i = 0; i < 41; i++) last = (await POST(req())).status;
    expect(last).toBe(429);
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

  it("fires geofence enter/exit with hysteresis (no flap in the jitter band)", async () => {
    // 100 m fence → outer band ≈ 125 m. Latitude: ~111 m per 0.001°.
    await prisma.geofence.create({
      data: { childId, name: "École", lat: 48, lng: 2, radius: 100, notifyOnEnter: true, notifyOnExit: true },
    });
    const ping = (lat: number, lng: number) => POST(syncReq({ location: { lat, lng, accuracy: 10 } }));
    await ping(48, 2); //          inside (first ping) → ENTER
    await ping(48.00108, 2); //    ~120 m: in the hysteresis band → NO exit
    await ping(48, 2); //          back inside → NO re-enter (no flap)
    await ping(48.02, 2); //       ~2.2 km: clearly beyond the band → EXIT

    const geo = await prisma.alert.findMany({ where: { childId, type: "geofence" }, orderBy: { ts: "asc" } });
    const msgs = geo.map((a: any) => a.message);
    expect(msgs.filter((m: string) => m.includes("Arrivée"))).toHaveLength(1); // exactly one enter
    expect(msgs.filter((m: string) => m.includes("Départ"))).toHaveLength(1); //  exactly one exit
    expect(geo).toHaveLength(2); // the band jitter produced NO extra alerts
  });

  it("cumulative usageToday is idempotent and monotonic (a retry can't double-count screen time)", async () => {
    const date = "2026-07-02";
    const send = (seconds: number) =>
      POST(syncReq({ usageToday: [{ appId: "game.exe", appName: "Game", category: "game", date, seconds }] }));

    await send(600); // 10 min today
    await send(600); // RETRY of the same batch (lost response) → must stay 600, not 1200
    let row = await prisma.appUsage.findFirst({ where: { childId, appId: "game.exe", date } });
    expect(row.seconds).toBe(600);

    await send(900); // usage grew to 15 min → total is raised
    row = await prisma.appUsage.findFirst({ where: { childId, appId: "game.exe", date } });
    expect(row.seconds).toBe(900);

    await send(300); // stale / reordered lower value → must NOT lower the total
    row = await prisma.appUsage.findFirst({ where: { childId, appId: "game.exe", date } });
    expect(row.seconds).toBe(900);
  });

  it("legacy incremental `usage` still accumulates (backward compatible with old agents)", async () => {
    const date = "2026-07-03";
    const send = (seconds: number) =>
      POST(syncReq({ usage: [{ appId: "legacy.exe", appName: "Legacy", category: "other", date, seconds }] }));
    await send(100);
    await send(50);
    const row = await prisma.appUsage.findFirst({ where: { childId, appId: "legacy.exe", date } });
    expect(row.seconds).toBe(150); // increment path unchanged when usageToday is absent
  });

  it("creates 'allow' rules from an installed-apps scan, never overwriting existing rules", async () => {
    // a parent-set block that MUST survive the scan
    await prisma.appRule.create({ data: { childId, appId: "chrome.exe", appName: "Chrome", action: "block" } });
    const res = await POST(
      syncReq({
        installedApps: [
          { appId: "chrome.exe", appName: "Google Chrome" }, // already ruled → keep the block
          { appId: "firefox.exe", appName: "Mozilla Firefox" }, // new → allow
          { appId: "steam.exe", appName: "Steam" }, // new → allow
          { appId: "firefox.exe", appName: "dup" }, // duplicate in the batch → ignored
        ],
      }),
    );
    expect(res.status).toBe(200);
    const rules = await prisma.appRule.findMany({ where: { childId, appId: { in: ["chrome.exe", "firefox.exe", "steam.exe"] } } });
    const byId: Record<string, any> = Object.fromEntries(rules.map((r: any) => [r.appId, r]));
    expect(byId["chrome.exe"].action).toBe("block"); // preserved, NOT reset to allow
    expect(byId["firefox.exe"].action).toBe("allow"); // new app auto-added
    expect(byId["steam.exe"].action).toBe("allow");
    expect(byId["firefox.exe"].category).toBe("browser"); // categorized server-side
    expect(rules.length).toBe(3); // no duplicate firefox row
  });
});
