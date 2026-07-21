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

  it("dedupes a retried timeRequest and caps pending requests per child", async () => {
    await prisma.timeRequest.deleteMany({ where: { childId } });
    await prisma.alert.deleteMany({ where: { childId, type: "time_request" } });

    // Retry after a lost response: same minutes re-sent → ONE row, ONE alert
    // (the parent used to see two identical entries and approve both).
    await POST(syncReq({ timeRequest: { minutes: 60 } }));
    await POST(syncReq({ timeRequest: { minutes: 60 } }));
    expect(await prisma.timeRequest.count({ where: { childId, status: "pending" } })).toBe(1);
    expect(await prisma.alert.count({ where: { childId, type: "time_request" } })).toBe(1);

    // Different asks still go through — up to the pending cap of 3.
    await POST(syncReq({ timeRequest: { minutes: 30 } }));
    await POST(syncReq({ timeRequest: { minutes: 15 } }));
    await POST(syncReq({ timeRequest: { minutes: 5 } })); // 4th pending → capped
    expect(await prisma.timeRequest.count({ where: { childId, status: "pending" } })).toBe(3);
  });

  it("refuses to ack a command addressed to a SIBLING device (stays pending)", async () => {
    const sibling = await prisma.device.findUnique({ where: { enrollToken: RL_TOKEN } });
    const cmd = await prisma.command.create({
      data: { childId, deviceId: sibling.id, type: "lock", payload: "{}", status: "pending" },
    });

    // The other device (TOKEN) tries to mark the sibling's command done before
    // it was ever delivered — e.g. a child using their own device's token to
    // cancel the parent's lock on the family PC.
    const res = await POST(syncReq({ deliverCommands: false, commandResults: [{ id: cmd.id, status: "done" }] }));
    expect(res.status).toBe(200);

    const after = await prisma.command.findUnique({ where: { id: cmd.id } });
    expect(after.status).toBe("pending"); // untouched — still delivered to the right device later
    await prisma.command.delete({ where: { id: cmd.id } });
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

  it("returns the child's geofences so a device can register OS boundaries", async () => {
    const fence = await prisma.geofence.create({
      data: { childId, name: "Maison", lat: 45.5, lng: 4.2, radius: 150, notifyOnEnter: true, notifyOnExit: true },
    });
    const res = await POST(syncReq({ online: true }));
    const data = (await res.json()) as {
      geofences: { id: string; name: string; lat: number; lng: number; radius: number }[];
    };
    const got = data.geofences.find((g) => g.id === fence.id);
    expect(got).toBeTruthy();
    expect(got).toMatchObject({ name: "Maison", lat: 45.5, lng: 4.2, radius: 150 });
    // notifyOnEnter/Exit are the parent's server-side concern; the device only
    // needs the geometry, so they are intentionally NOT sent.
    expect(got).not.toHaveProperty("notifyOnEnter");
  });

  it("a panic event raises ONE critical SOS alert even when re-flushed (offline queue)", async () => {
    const ev = { id: "sos-evt-1", type: "panic", title: "SOS", detail: JSON.stringify({ lat: 48.85, lng: 2.35 }) };
    await POST(syncReq({ events: [ev] }));
    await POST(syncReq({ events: [ev] })); // the offline queue re-flushes the same SOS
    const alerts = await prisma.alert.findMany({ where: { childId, type: "panic" } });
    expect(alerts.length).toBe(1); // deduped by the event id
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].message).toContain("position"); // location carried in the event detail
  });

  it("dedups activity events by id on a retried sync (no duplicate rows or alerts)", async () => {
    const ev = { id: "evt-dedup-1", type: "new_app", title: "Roblox", detail: "roblox.exe" };
    await POST(syncReq({ events: [ev] }));
    await POST(syncReq({ events: [ev] })); // retry of the same batch (lost response)

    const stored = await prisma.activityEvent.findMany({ where: { childId, id: "evt-dedup-1" } });
    expect(stored.length).toBe(1); // event stored exactly once
    const alerts = await prisma.alert.findMany({ where: { childId, type: "new_app" } });
    const roblox = alerts.filter((a: any) => a.message.includes("Roblox"));
    expect(roblox.length).toBe(1); // its alert fired exactly once
  });

  it("dedups web visits by id on a retried sync (no duplicate rows or alerts)", async () => {
    const w = { id: "wv-dedup-1", domain: "casino.example", category: "gambling", blocked: true };
    await POST(syncReq({ webVisits: [w] }));
    await POST(syncReq({ webVisits: [w] })); // retry of the same batch
    const rows = await prisma.webVisit.findMany({ where: { childId, id: "wv-dedup-1" } });
    expect(rows.length).toBe(1);
    const blocked = await prisma.alert.findMany({ where: { childId, type: "blocked_attempt" } });
    expect(blocked.filter((a: any) => a.message.includes("casino.example")).length).toBe(1);
  });

  it("web-visit keyword/risk scan fires once on a retried sync (not just the row + blocked alert)", async () => {
    // A web visit whose title hits a CRITICAL keyword (survives the parent's mute).
    // Before the fix, section 6c re-scanned body.webVisits (un-deduped), so a retry
    // re-created the SAME keyword alert; now it scans only the deduped fresh set.
    const before = await prisma.alert.count({ where: { childId, type: "keyword" } });
    const w = { id: "wv-kw-1", domain: "forum.example", title: "comment mourir", category: "other" };
    await POST(syncReq({ webVisits: [w] }));
    await POST(syncReq({ webVisits: [w] })); // retry of the same batch (lost response)
    const after = await prisma.alert.count({ where: { childId, type: "keyword" } });
    expect(after - before).toBe(1); // the keyword alert fired exactly once across the retry
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
