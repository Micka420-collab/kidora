import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { buildPolicy } from "@/lib/policy";
import { rateLimit, clientIp } from "@/lib/ratelimit";

const schema = z.object({
  enrollToken: z.string().min(1),
  deviceInfo: z
    .object({
      model: z.string().optional(),
      hostname: z.string().optional(),
      agentVersion: z.string().optional(),
    })
    .optional(),
});

// POST /api/agent/enroll — first contact from a device agent.
export async function POST(req: NextRequest) {
  // Limit enrollment attempts per IP to deter enroll-token brute force.
  const rl = rateLimit(`enroll:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return apiError("Trop de tentatives d'enrôlement.", 429);

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("Données invalides", 422);

  const device = await prisma.device.findUnique({
    where: { enrollToken: parsed.data.enrollToken },
    include: { child: true },
  });
  if (!device) return apiError("Jeton d'enrôlement invalide", 401);

  const updated = await prisma.device.update({
    where: { id: device.id },
    data: {
      enrolled: true,
      online: true,
      lastSeen: new Date(),
      model: parsed.data.deviceInfo?.model ?? device.model,
      agentVersion: parsed.data.deviceInfo?.agentVersion ?? device.agentVersion,
    },
  });

  const policy = await buildPolicy(device.childId);

  return json({
    deviceId: updated.id,
    childId: device.childId,
    childName: device.child.name,
    policy,
    syncIntervalSeconds: 30,
  });
}
