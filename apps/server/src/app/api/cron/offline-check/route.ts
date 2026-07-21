import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/http";
import { isCronAuthorized } from "@/lib/cron-auth";
import { offlineThresholdHours } from "@/lib/connectivity";
import { parseMutedTypes, isAlertMuted } from "@/lib/alert-prefs";
import { sendPushToParent } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const key = new URL(req.url).searchParams.get("key") ?? "";
  return isCronAuthorized({
    secret: process.env.CRON_SECRET,
    isProduction: process.env.NODE_ENV === "production",
    bearer,
    key,
  });
}

// GET /api/cron/offline-check — alert parents about devices that stopped
// reporting (possible disabled agent). Fires once per outage (offlineNotified),
// re-armed when the device syncs again. Hourly Vercel Cron.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return apiError("Unauthorized", 401);

  const url = new URL(req.url);
  const hours = offlineThresholdHours(url.searchParams.get("hours") ?? process.env.OFFLINE_ALERT_HOURS);
  const dryRun = ["1", "true"].includes((url.searchParams.get("dryRun") ?? "").toLowerCase());
  const cutoff = new Date(Date.now() - hours * 3600_000);

  // Devices that were active but have gone silent past the threshold and
  // haven't been alerted for this outage yet.
  const stale = await prisma.device.findMany({
    where: { offlineNotified: false, lastSeen: { not: null, lt: cutoff } },
    select: { id: true, name: true, lastSeen: true, child: { select: { id: true, name: true, parentId: true, parent: { select: { alertPrefs: true } } } } },
  });

  let alerted = 0;
  const pushes: Promise<unknown>[] = [];
  for (const d of stale) {
    const muted = isAlertMuted(parseMutedTypes(d.child.parent.alertPrefs), "device_offline");
    if (dryRun) {
      if (!muted) alerted++; // would alert (no mutation in dry run)
      continue;
    }
    // Claim + alert in ONE transaction. The claim alone used to commit first;
    // if the alert.create then failed (SQLITE_BUSY, kill, timeout) the device
    // stayed offlineNotified=true with no alert row — and since sync is the
    // only re-arm point, the parent was never told about that outage at all.
    // One device failing must not abort the rest of the sweep either.
    let outcome: "alerted" | "raced" | "muted";
    try {
      outcome = await prisma.$transaction(async (tx) => {
        // Atomic claim: overlapping cron runs can't both alert, and a muted
        // device is still marked so a later un-mute doesn't fire a stale alert.
        const claim = await tx.device.updateMany({
          where: { id: d.id, offlineNotified: false },
          data: { offlineNotified: true },
        });
        if (claim.count !== 1) return "raced";
        if (muted) return "muted";
        // Report the ACTUAL outage length, not the threshold.
        const sinceH = d.lastSeen ? Math.max(hours, Math.round((Date.now() - d.lastSeen.getTime()) / 3600_000)) : hours;
        await tx.alert.create({
          data: {
            parentId: d.child.parentId,
            childId: d.child.id,
            type: "device_offline",
            severity: "warning",
            message: `📵 L'appareil « ${d.name} » de ${d.child.name} n'a plus donné de nouvelles depuis ${sinceH} h.`,
          },
        });
        return "alerted";
      });
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "offline_check_device_failed", deviceId: d.id, error: e instanceof Error ? e.message : String(e), ts: new Date().toISOString() }));
      continue;
    }
    if (outcome !== "alerted") continue;

    pushes.push(
      sendPushToParent(d.child.parentId, {
        title: `Kidora — appareil hors-ligne (${d.child.name})`,
        body: `« ${d.name} » ne répond plus.`,
        url: `/dashboard/children/${d.child.id}/devices`,
      }).catch(() => {}),
    );
    alerted++;
  }

  // Await the pushes: on serverless the lambda freezes as soon as the response
  // returns, so a fire-and-forget push (with its retry/backoff sleeps) would be
  // abandoned mid-flight — losing the very notification this cron exists for.
  await Promise.allSettled(pushes);

  return json({ ok: true, dryRun, thresholdHours: hours, candidates: stale.length, alerted });
}
