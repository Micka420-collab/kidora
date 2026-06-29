import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, apiError, readJson, getDeviceFromRequest } from "@/lib/http";

const schema = z.object({
  commandId: z.string().optional(),
  // data:image/jpeg;base64,...  (cap ~8MB encoded)
  dataUrl: z.string().min(30).max(12_000_000).regex(/^data:image\/(jpeg|png);base64,/),
});

// POST /api/agent/screenshot — device uploads a captured screen (Bearer enrollToken)
export async function POST(req: NextRequest) {
  const device = await getDeviceFromRequest(req);
  if (!device) return apiError("Appareil non authentifié", 401);

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("Image invalide", 422);

  const shot = await prisma.screenshot.create({
    data: { childId: device.childId, deviceId: device.id, dataUrl: parsed.data.dataUrl },
  });

  if (parsed.data.commandId) {
    await prisma.command.updateMany({
      where: { id: parsed.data.commandId, childId: device.childId },
      data: { status: "done", result: shot.id },
    });
  }

  // keep only the 20 most recent per child
  const old = await prisma.screenshot.findMany({
    where: { childId: device.childId },
    orderBy: { createdAt: "desc" },
    skip: 20,
    select: { id: true },
  });
  if (old.length) {
    await prisma.screenshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }

  return json({ id: shot.id });
}
