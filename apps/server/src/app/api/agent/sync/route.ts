import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, apiError, readJson, getDeviceFromRequest } from "@/lib/http";
import { buildPolicy } from "@/lib/policy";
import { scanText } from "@/lib/keywords";
import { riskSeverity, RISK_CATEGORY_LABELS } from "@/lib/risk";
import { categorizeApp } from "@/lib/categories";
import { sendPushToChildGuardians } from "@/lib/push";
import { geofenceTransition } from "@/lib/geo";
import { parseMutedTypes, isAlertMuted } from "@/lib/alert-prefs";
import { safeDate, capAlerts } from "@/lib/ingest";
import { clampTzOffset } from "@/lib/localdate";
import { rateLimit } from "@/lib/ratelimit";
import { combinedRisk, type AiRiskCtx } from "@/lib/openrouter";
import { decrypt } from "@/lib/crypto";
import { signedPolicyFields } from "@/lib/policy-sign";
import { AGENT_BUNDLE_VERSION } from "@/lib/agent-bundle.generated";

// Sync can call the parent's LLM for risk scoring; give the function headroom so
// a slow model can't kill the request mid-write (the LLM step is itself bounded
// by the per-sync `deadline` below, well under this ceiling).
export const maxDuration = 30;

const eventSchema = z.object({
  // Agent-supplied stable id → used as the row primary key so a retried sync
  // (lost response) doesn't create duplicate events or re-fire their alerts.
  id: z.string().min(1).max(64).optional(),
  type: z.string(),
  title: z.string().optional(),
  detail: z.string().optional(),
  category: z.string().optional(),
  blocked: z.boolean().optional(),
  ts: z.string().optional(),
});

const syncSchema = z.object({
  online: z.boolean().optional(),
  battery: z.number().int().min(0).max(100).optional(),
  agentVersion: z.string().optional(),
  tzOffset: z.number().optional(), // minutes to add to UTC for the device's local time

  events: z.array(eventSchema).max(500).optional(),
  usage: z
    .array(
      z.object({
        appId: z.string(),
        appName: z.string(),
        category: z.string().optional(),
        date: z.string(),
        seconds: z.number().int().min(0).max(86400),
      }),
    )
    .max(500)
    .optional(),
  // Cumulative daily totals (idempotent). When present, the server SETs the
  // daily total monotonically instead of incrementing — a retried sync after a
  // lost response can't double-count. Same row shape as `usage`.
  usageToday: z
    .array(
      z.object({
        appId: z.string(),
        appName: z.string(),
        category: z.string().optional(),
        date: z.string(),
        seconds: z.number().int().min(0).max(86400),
      }),
    )
    .max(500)
    .optional(),
  webVisits: z
    .array(
      z.object({
        domain: z.string(),
        url: z.string().optional(),
        title: z.string().optional(),
        category: z.string().optional(),
        blocked: z.boolean().optional(),
        ts: z.string().optional(),
      }),
    )
    .max(500)
    .optional(),
  videos: z
    .array(
      z.object({
        title: z.string().max(300),
        channel: z.string().max(200).optional(),
        url: z.string().max(500).optional(),
        source: z.string().max(40).optional(),
        platform: z.enum(["pc", "phone"]).optional(),
        ts: z.string().optional(),
      }),
    )
    .max(200)
    .optional(),
  messages: z
    .array(
      z.object({
        direction: z.enum(["in", "out"]),
        contact: z.string().max(200).optional(),
        body: z.string().max(2000),
        app: z.string().max(40).optional(),
        ts: z.string().optional(),
      }),
    )
    .max(200)
    .optional(),
  location: z
    .object({
      lat: z.number().finite().min(-90).max(90),
      lng: z.number().finite().min(-180).max(180),
      accuracy: z.number().finite().min(0).optional(),
      address: z.string().optional(),
    })
    .optional(),
  commandResults: z
    .array(z.object({ id: z.string(), status: z.enum(["done", "failed"]), result: z.string().max(2000).optional() }))
    .max(200)
    .optional(),
  timeRequest: z
    .object({ minutes: z.number().int().min(5).max(480), reason: z.string().max(200).optional() })
    .optional(),
  // Full inventory of installed apps from the agent's startup PC scan → each new
  // one becomes an "allow" rule so the parent sees every app upfront.
  installedApps: z
    .array(z.object({ appId: z.string().min(1).max(120), appName: z.string().min(1).max(160) }))
    .max(1000)
    .optional(),
  panic: z.boolean().optional(),
  // When false, this sync does NOT consume pending commands (they stay "pending"
  // for the next full sync). Set by callers that can't act on commands — e.g. the
  // mobile background location task — so a parent command isn't marked delivered
  // and lost. Defaults to true (full delivery).
  deliverCommands: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const device = await getDeviceFromRequest(req);
  if (!device) return apiError("Appareil non authentifié", 401);

  // Cap sync volume per device so a leaked enroll token can't flood the DB.
  // Normal cadence is ~2/min; 40/min leaves ample headroom for retries.
  const rl = rateLimit(`agent-sync:${device.id}`, 40, 60_000);
  if (!rl.ok) return apiError("Trop de requêtes", 429);

  const parsed = syncSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("Données invalides", 422);
  const body = parsed.data;
  const { childId } = device;
  const parentId = device.child.parentId;

  // 1. device heartbeat
  await prisma.device.update({
    where: { id: device.id },
    data: {
      online: body.online ?? true,
      lastSeen: new Date(),
      offlineNotified: false, // device is reporting again → re-arm the offline alert
      ...(body.battery !== undefined && { battery: body.battery }),
      ...(body.agentVersion && { agentVersion: body.agentVersion }),
    },
  });

  // Record the family's local-time offset (used to bucket the screen-time day,
  // bonus grants and "today's usage" in local time). Written only when it changes.
  if (body.tzOffset !== undefined) {
    const tz = clampTzOffset(body.tzOffset);
    if (tz !== device.child.tzOffsetMinutes) {
      await prisma.child.update({ where: { id: childId }, data: { tzOffsetMinutes: tz } });
    }
  }

  const alerts: { parentId: string; childId: string; type: string; severity: string; message: string }[] = [];

  // Optional LLM risk scoring with the parent's own OpenRouter model. Loaded
  // once, only when there's text to analyze; a small per-sync budget bounds
  // cost/latency (heuristic covers the rest).
  let aiCtx: AiRiskCtx = null;
  const hasRiskText =
    (body.messages?.length ?? 0) > 0 ||
    (body.webVisits?.length ?? 0) > 0 ||
    (body.events ?? []).some((e) => e.type === "search" || e.type === "web_visit");
  if (hasRiskText) {
    const p = await prisma.parent.findUnique({
      where: { id: parentId },
      select: { aiEnabled: true, aiModel: true, aiApiKey: true },
    });
    if (p?.aiEnabled && p.aiApiKey && p.aiModel) {
      // Shared 7s wall-clock deadline caps total LLM latency across BOTH risk
      // loops (messages + searches), keeping the sync well under maxDuration even
      // if OpenRouter is slow — remaining texts fall back to the heuristic.
      aiCtx = { apiKey: decrypt(p.aiApiKey), model: p.aiModel, budget: { n: 5 }, deadline: Date.now() + 7000 };
    }
  }

  // 2. activity events. Dedup by the agent-supplied id: a retried sync (lost
  //    response) re-sends the same events, so we drop the ones already stored and
  //    process only the FRESH ones — no duplicate rows AND no duplicate alerts.
  //    (DB-agnostic: an existence query + filter, no skipDuplicates.)
  let freshEvents = body.events ?? [];
  if (body.events?.length) {
    const withId = body.events.filter((e) => e.id).map((e) => e.id as string);
    const already = withId.length
      ? new Set(
          (await prisma.activityEvent.findMany({ where: { id: { in: withId } }, select: { id: true } })).map((r) => r.id),
        )
      : new Set<string>();
    freshEvents = body.events.filter((e) => !e.id || !already.has(e.id));

    if (freshEvents.length) {
      await prisma.activityEvent.createMany({
        data: freshEvents.map((e) => ({
          ...(e.id ? { id: e.id } : {}),
          childId,
          deviceId: device.id,
          type: e.type,
          title: e.title,
          detail: e.detail,
          category: e.category,
          blocked: e.blocked ?? false,
          ts: safeDate(e.ts),
        })),
      });
    }
    for (const e of freshEvents) {
      if (e.blocked) {
        alerts.push({
          parentId,
          childId,
          type: "blocked_attempt",
          severity: "warning",
          message: `Tentative bloquée : ${e.title ?? e.detail ?? e.type}`,
        });
      }
      if (e.type === "new_app") {
        alerts.push({
          parentId,
          childId,
          type: "new_app",
          severity: "info",
          message: `Nouvelle application détectée : ${e.title ?? e.detail}`,
        });
      }
      if (e.type === "limit_reached") {
        alerts.push({
          parentId,
          childId,
          type: "limit_reached",
          severity: "info",
          message: `Limite de temps atteinte : ${e.title ?? ""}`,
        });
      }
      if (e.type === "clock_change") {
        // Anti-tamper: the child moved the device clock to try to dodge bedtime
        // or reset the daily limit. Not mutable (see alert-prefs).
        alerts.push({
          parentId,
          childId,
          type: "clock_change",
          severity: "warning",
          message: `⏱️ Heure système modifiée sur l'appareil de ${device.child.name}${e.detail ? ` (${e.detail})` : ""}`,
        });
      }
    }
  }

  // 3. app usage. Prefer the IDEMPOTENT cumulative report (`usageToday`): SET the
  //    daily total monotonically so a retried sync (lost response) can't
  //    double-count screen time. Fall back to the legacy incremental `usage` for
  //    older agents that don't send cumulative totals.
  if (body.usageToday?.length) {
    for (const u of body.usageToday) {
      // Ensure the row exists (without lowering an existing higher total)…
      await prisma.appUsage.upsert({
        where: { deviceId_appId_date: { deviceId: device.id, appId: u.appId, date: u.date } },
        create: {
          childId,
          deviceId: device.id,
          appId: u.appId,
          appName: u.appName,
          category: u.category,
          date: u.date,
          seconds: u.seconds,
        },
        update: { appName: u.appName }, // seconds handled by the monotonic raise below
      });
      // …then raise the total only if the reported cumulative value is higher.
      // Re-sending the same value is a no-op (idempotent); a stale/reordered
      // lower value can't decrease the count.
      await prisma.appUsage.updateMany({
        where: { deviceId: device.id, appId: u.appId, date: u.date, seconds: { lt: u.seconds } },
        data: { seconds: u.seconds },
      });
    }
  } else if (body.usage?.length) {
    for (const u of body.usage) {
      await prisma.appUsage.upsert({
        where: { deviceId_appId_date: { deviceId: device.id, appId: u.appId, date: u.date } },
        create: {
          childId,
          deviceId: device.id,
          appId: u.appId,
          appName: u.appName,
          category: u.category,
          date: u.date,
          seconds: u.seconds,
        },
        update: { seconds: { increment: u.seconds }, appName: u.appName },
      });
    }
  }

  // 3b. installed-apps inventory (agent's startup PC scan): create an "allow"
  //     rule for each app NOT already ruled, so the parent sees every installed
  //     app in the Apps tab without waiting for the child to open it. Existing
  //     rules are never touched (a parent's block/limit is preserved).
  if (body.installedApps?.length) {
    const existing = await prisma.appRule.findMany({ where: { childId }, select: { appId: true } });
    const have = new Set(existing.map((r) => r.appId));
    const seen = new Set<string>();
    const toAdd = body.installedApps.filter((a) => {
      if (have.has(a.appId) || seen.has(a.appId)) return false;
      seen.add(a.appId);
      return true;
    });
    if (toAdd.length) {
      await prisma.appRule
        .createMany({
          data: toAdd.map((a) => ({
            childId,
            appId: a.appId,
            appName: a.appName,
            category: categorizeApp(a.appId, a.appName),
            action: "allow",
          })),
        })
        .catch(() => {}); // ignore a rare race with a concurrent create
    }
  }

  // 4. web visits
  if (body.webVisits?.length) {
    await prisma.webVisit.createMany({
      data: body.webVisits.map((w) => ({
        childId,
        deviceId: device.id,
        domain: w.domain,
        url: w.url,
        title: w.title,
        category: w.category,
        blocked: w.blocked ?? false,
        ts: safeDate(w.ts),
      })),
    });
    for (const w of body.webVisits) {
      if (w.blocked) {
        alerts.push({
          parentId,
          childId,
          type: "blocked_attempt",
          severity: "warning",
          message: `Site bloqué : ${w.domain}`,
        });
      }
    }
  }

  // 4b. watched videos (e.g. YouTube titles)
  if (body.videos?.length) {
    await prisma.watchedVideo.createMany({
      data: body.videos.map((v) => ({
        childId,
        deviceId: device.id,
        source: v.source ?? "youtube",
        platform: v.platform ?? "pc",
        title: v.title,
        channel: v.channel,
        url: v.url,
        ts: safeDate(v.ts),
      })),
    });
  }

  // 4c. messages (SMS / chat sent & received) + AI-style risk analysis
  if (body.messages?.length) {
    await prisma.message.createMany({
      data: body.messages.map((m) => ({
        childId,
        deviceId: device.id,
        app: m.app ?? "sms",
        direction: m.direction,
        contact: m.contact,
        body: m.body,
        ts: safeDate(m.ts),
      })),
    });
    // Scan each message for risk signals (grooming, self-harm, bullying…).
    // Heuristic + optional LLM, in parallel (budget-bounded).
    const scored = await Promise.all(body.messages.map((m) => combinedRisk(m.body, aiCtx)));
    body.messages.forEach((m, i) => {
      const r = scored[i];
      if (r.level === "medium" || r.level === "high" || r.level === "critical") {
        const cat = RISK_CATEGORY_LABELS[r.topCategory ?? ""] ?? "Risque";
        const who = m.contact ? ` (${m.direction === "in" ? "de" : "à"} ${m.contact})` : "";
        const preview = m.body.length > 80 ? `${m.body.slice(0, 80)}…` : m.body;
        alerts.push({
          parentId,
          childId,
          type: "risk",
          severity: riskSeverity(r.level),
          message: `⚠️ ${cat} détecté dans un message${who} — « ${preview} »`,
        });
      }
    });
  }

  // 5. location + geofence transitions
  if (body.location) {
    // Compare against THIS device's previous ping, not the child's latest across
    // all devices — otherwise a child with two location-reporting devices (phone
    // out, tablet at home) sees `prev` alternate between places and fires
    // spurious enter/exit alerts.
    const prev = await prisma.locationPing.findFirst({
      where: { childId, deviceId: device.id },
      orderBy: { ts: "desc" },
    });
    await prisma.locationPing.create({
      data: {
        childId,
        deviceId: device.id,
        lat: body.location.lat,
        lng: body.location.lng,
        accuracy: body.location.accuracy,
        address: body.location.address,
      },
    });
    const fences = await prisma.geofence.findMany({ where: { childId } });
    const now = { lat: body.location.lat, lng: body.location.lng };
    const prevLoc = prev ? { lat: prev.lat, lng: prev.lng } : null;
    for (const f of fences) {
      const transition = geofenceTransition(prevLoc, now, f, body.location.accuracy);
      if (transition === "enter") {
        alerts.push({ parentId, childId, type: "geofence", severity: "info", message: `Arrivée à « ${f.name} »` });
      }
      if (transition === "exit") {
        alerts.push({ parentId, childId, type: "geofence", severity: "info", message: `Départ de « ${f.name} »` });
      }
    }
  }

  // 6. command results
  if (body.commandResults?.length) {
    for (const r of body.commandResults) {
      await prisma.command.updateMany({
        where: { id: r.id, childId },
        data: { status: r.status, result: r.result },
      });
    }
  }

  // 6b. time request from the child
  if (body.timeRequest) {
    await prisma.timeRequest.create({
      data: { childId, minutes: body.timeRequest.minutes, reason: body.timeRequest.reason },
    });
    alerts.push({
      parentId,
      childId,
      type: "time_request", // distinct & actionable — not muted with "limit_reached"
      severity: "info",
      message: `${device.child.name} demande ${body.timeRequest.minutes} min de plus${body.timeRequest.reason ? ` : « ${body.timeRequest.reason} »` : ""}`,
    });
  }

  // 6b-bis. SOS / panic from the child
  if (body.panic) {
    const where = body.location
      ? ` (position : ${body.location.lat.toFixed(5)}, ${body.location.lng.toFixed(5)})`
      : "";
    alerts.push({
      parentId,
      childId,
      type: "panic",
      severity: "critical",
      message: `🆘 ${device.child.name} a déclenché une alerte SOS${where}`,
    });
  }

  // 6c. sensitive-keyword scan over searches & page titles
  {
    const watched = await prisma.watchedKeyword.findMany({ where: { childId } });
    const customTerms = watched.map((w) => w.term);
    const texts: string[] = [];
    // Use the FRESH events (deduped above) so a retried sync doesn't re-scan the
    // same searches and re-raise keyword/risk alerts.
    for (const e of freshEvents) {
      if (e.type === "search" || e.type === "web_visit") texts.push(`${e.title ?? ""} ${e.detail ?? ""}`);
    }
    for (const w of body.webVisits ?? []) texts.push(`${w.title ?? ""} ${w.url ?? ""} ${w.domain}`);

    const flagged = new Set<string>();
    // Keyword scan (fast, synchronous).
    for (const t of texts) {
      for (const hit of scanText(t, customTerms)) {
        if (flagged.has(hit.keyword)) continue;
        flagged.add(hit.keyword);
        alerts.push({
          parentId,
          childId,
          type: "keyword",
          severity: hit.severity,
          message: `Mot-clé sensible détecté (${hit.category}) : « ${hit.keyword} »`,
        });
      }
    }
    // Risk scorer over searches/titles (heuristic + optional LLM, in parallel) —
    // only escalate high+ here to avoid noise (messages already cover medium+).
    const scoredTexts = await Promise.all(texts.map((t) => combinedRisk(t, aiCtx)));
    for (const r of scoredTexts) {
      if ((r.level === "high" || r.level === "critical") && !flagged.has(`risk:${r.topCategory}`)) {
        flagged.add(`risk:${r.topCategory}`);
        alerts.push({
          parentId,
          childId,
          type: "risk",
          severity: riskSeverity(r.level),
          message: `⚠️ ${RISK_CATEGORY_LABELS[r.topCategory ?? ""] ?? "Risque"} détecté dans une recherche/page`,
        });
      }
    }
  }

  // 7. persist alerts (honouring the parent's muted types; safety types are
  //    never muted) + push critical ones to the parent's devices
  if (alerts.length) {
    const parentPrefs = await prisma.parent.findUnique({
      where: { id: parentId },
      select: { alertPrefs: true },
    });
    const muted = parseMutedTypes(parentPrefs?.alertPrefs);
    // Collapse a flood (one sync can produce 100s of blocked-attempt/new-app
    // events) into a capped, de-duplicated set before muting + persisting.
    const kept = capAlerts(alerts).filter((a) => !isAlertMuted(muted, a.type, a.severity));
    if (kept.length) {
      await prisma.alert.createMany({ data: kept });
      const critical = kept.filter((a) => a.severity === "critical");
      if (critical.length) {
        // Fan out to every guardian (owner + co-guardians), not just the owner.
        // One push per distinct critical message so several (e.g. SOS + a risk
        // hit) in one sync aren't collapsed into just the first.
        const seenMsg = new Set<string>();
        for (const c of critical) {
          if (seenMsg.has(c.message)) continue;
          seenMsg.add(c.message);
          sendPushToChildGuardians(childId, {
            title: `Kidora — alerte (${device.child.name})`,
            body: c.message,
            url: `/dashboard/children/${childId}`,
          }).catch(() => {});
        }
      }
    }
  }

  // 7b. Redeliver commands that were delivered but never acknowledged (the agent
  //     crashed or the response was lost) after a grace period, so a parent's
  //     "lock"/"message" isn't silently dropped. Normal acks land within a sync
  //     cycle, well under the grace window.
  if (body.deliverCommands !== false) {
    const graceMin = Number(process.env.COMMAND_REDELIVER_MINUTES);
    const graceMs = (Number.isFinite(graceMin) ? graceMin : 10) * 60_000;
    await prisma.command.updateMany({
      where: { childId, status: "delivered", updatedAt: { lt: new Date(Date.now() - graceMs) } },
      data: { status: "pending" },
    });
  }

  // 8. pending commands → deliver. A caller that can't act on commands (e.g. the
  //    background location task) passes deliverCommands:false so they're left
  //    "pending" for the next full sync instead of being marked delivered & lost.
  const pending =
    body.deliverCommands === false
      ? []
      : await prisma.command.findMany({
          where: { childId, status: "pending", OR: [{ deviceId: device.id }, { deviceId: null }] },
          orderBy: { createdAt: "asc" },
        });
  if (pending.length) {
    await prisma.command.updateMany({
      where: { id: { in: pending.map((c) => c.id) } },
      data: { status: "delivered" },
    });
  }

  const policy = await buildPolicy(childId);
  // Most recent still-pending time request, so the Kids screen can show
  // "request awaiting a decision" (clears itself once approved or denied).
  const pendingTimeRequest = await prisma.timeRequest.findFirst({
    where: { childId, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { minutes: true },
  });
  return json({
    policy,
    // Signed envelope so the agent can verify (and safely cache) this policy for
    // tamper-proof offline enforcement (see lib/policy-sign).
    ...signedPolicyFields(policy, childId),
    commands: pending.map((c) => ({ id: c.id, type: c.type, payload: JSON.parse(c.payload) })),
    pendingTimeRequest: pendingTimeRequest ? { minutes: pendingTimeRequest.minutes } : null,
    serverTime: new Date().toISOString(),
    agentLatest: AGENT_BUNDLE_VERSION, // agent self-updates when this is newer
  });
}
