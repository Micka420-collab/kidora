import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, apiError, readJson, getDeviceFromRequest } from "@/lib/http";
import { buildPolicy } from "@/lib/policy";
import { scanText } from "@/lib/keywords";
import { sendPushToParent } from "@/lib/push";

const eventSchema = z.object({
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
      lat: z.number(),
      lng: z.number(),
      accuracy: z.number().optional(),
      address: z.string().optional(),
    })
    .optional(),
  commandResults: z
    .array(z.object({ id: z.string(), status: z.string(), result: z.string().optional() }))
    .optional(),
  timeRequest: z
    .object({ minutes: z.number().int().min(5).max(480), reason: z.string().max(200).optional() })
    .optional(),
  panic: z.boolean().optional(),
});

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function POST(req: NextRequest) {
  const device = await getDeviceFromRequest(req);
  if (!device) return apiError("Appareil non authentifié", 401);

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
      ...(body.battery !== undefined && { battery: body.battery }),
      ...(body.agentVersion && { agentVersion: body.agentVersion }),
    },
  });

  const alerts: { parentId: string; childId: string; type: string; severity: string; message: string }[] = [];

  // 2. activity events
  if (body.events?.length) {
    await prisma.activityEvent.createMany({
      data: body.events.map((e) => ({
        childId,
        deviceId: device.id,
        type: e.type,
        title: e.title,
        detail: e.detail,
        category: e.category,
        blocked: e.blocked ?? false,
        ts: e.ts ? new Date(e.ts) : new Date(),
      })),
    });
    for (const e of body.events) {
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
    }
  }

  // 3. app usage (incremental seconds)
  if (body.usage?.length) {
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
        ts: w.ts ? new Date(w.ts) : new Date(),
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
        ts: v.ts ? new Date(v.ts) : new Date(),
      })),
    });
  }

  // 4c. messages (SMS / chat sent & received)
  if (body.messages?.length) {
    await prisma.message.createMany({
      data: body.messages.map((m) => ({
        childId,
        deviceId: device.id,
        app: m.app ?? "sms",
        direction: m.direction,
        contact: m.contact,
        body: m.body,
        ts: m.ts ? new Date(m.ts) : new Date(),
      })),
    });
  }

  // 5. location + geofence transitions
  if (body.location) {
    const prev = await prisma.locationPing.findFirst({
      where: { childId },
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
    for (const f of fences) {
      const nowIn = haversine(body.location.lat, body.location.lng, f.lat, f.lng) <= f.radius;
      const wasIn = prev ? haversine(prev.lat, prev.lng, f.lat, f.lng) <= f.radius : false;
      if (nowIn && !wasIn && f.notifyOnEnter) {
        alerts.push({ parentId, childId, type: "geofence", severity: "info", message: `Arrivée à « ${f.name} »` });
      }
      if (!nowIn && wasIn && f.notifyOnExit) {
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
      type: "limit_reached",
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
    for (const e of body.events ?? []) {
      if (e.type === "search" || e.type === "web_visit") texts.push(`${e.title ?? ""} ${e.detail ?? ""}`);
    }
    for (const w of body.webVisits ?? []) texts.push(`${w.title ?? ""} ${w.url ?? ""} ${w.domain}`);

    const flagged = new Set<string>();
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
  }

  // 7. persist alerts + push critical ones to the parent's devices
  if (alerts.length) {
    await prisma.alert.createMany({ data: alerts });
    const critical = alerts.filter((a) => a.severity === "critical");
    if (critical.length) {
      sendPushToParent(parentId, {
        title: `Kidora — alerte (${device.child.name})`,
        body: critical[0].message,
        url: `/dashboard/children/${childId}`,
      }).catch(() => {});
    }
  }

  // 8. pending commands → deliver
  const pending = await prisma.command.findMany({
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
  return json({
    policy,
    commands: pending.map((c) => ({ id: c.id, type: c.type, payload: JSON.parse(c.payload) })),
    serverTime: new Date().toISOString(),
  });
}
