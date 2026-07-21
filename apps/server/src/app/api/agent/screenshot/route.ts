import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, apiError, readJson, getDeviceFromRequest } from "@/lib/http";
import { encrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/ratelimit";

const schema = z.object({
  commandId: z.string().optional(),
  // data:image/jpeg;base64,...  (cap ~8MB encoded)
  dataUrl: z.string().min(30).max(12_000_000).regex(/^data:image\/(jpeg|png);base64,/),
});

// POST /api/agent/screenshot — device uploads a captured screen (Bearer enrollToken)
export async function POST(req: NextRequest) {
  const device = await getDeviceFromRequest(req);
  if (!device) return apiError("Appareil non authentifié", 401);

  // Screenshots are large; cap uploads per device (a leaked token can't fill
  // storage). Legitimate captures are on-demand and infrequent.
  const rl = await rateLimit(`agent-shot:${device.id}`, 12, 60_000);
  if (!rl.ok) return apiError("Trop de requêtes", 429);

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("Image invalide", 422);

  // The prefix regex alone let a device token upload megabytes of arbitrary
  // junk after the comma. Require the payload to actually decode to a
  // PNG/JPEG (magic bytes) matching the declared MIME.
  const dataUrl = parsed.data.dataUrl;
  const img = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const isPng = img.length > 8 && img[0] === 0x89 && img[1] === 0x50 && img[2] === 0x4e && img[3] === 0x47;
  const isJpeg = img.length > 3 && img[0] === 0xff && img[1] === 0xd8 && img[2] === 0xff;
  if (!(dataUrl.startsWith("data:image/png") ? isPng : isJpeg)) return apiError("Image invalide", 422);

  const shot = await prisma.screenshot.create({
    data: { childId: device.childId, deviceId: device.id, dataUrl: encrypt(dataUrl) },
  });

  if (parsed.data.commandId) {
    // Scoped to THIS device (or legacy unassigned rows) — a device must not be
    // able to complete/cancel a command addressed to a sibling device.
    await prisma.command.updateMany({
      where: { id: parsed.data.commandId, childId: device.childId, OR: [{ deviceId: device.id }, { deviceId: null }] },
      data: { status: "done", result: shot.id },
    });
  }

  // Keep only the 20 most recent PER DEVICE — the per-child cap let one
  // device's uploads evict the captures the parent requested from a SIBLING
  // device (surveillance-evasion primitive for a child with a device token).
  const old = await prisma.screenshot.findMany({
    where: { deviceId: device.id },
    orderBy: { createdAt: "desc" },
    skip: 20,
    select: { id: true },
  });
  if (old.length) {
    await prisma.screenshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }

  return json({ id: shot.id });
}
