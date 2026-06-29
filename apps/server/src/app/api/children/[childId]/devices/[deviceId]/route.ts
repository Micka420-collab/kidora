import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ childId: string; deviceId: string }> };

const patchSchema = z.object({ name: z.string().min(1).max(80) });

// PATCH — rename a device
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId, deviceId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);
    const device = await prisma.device.updateMany({
      where: { id: deviceId, childId },
      data: { name: parsed.data.name },
    });
    if (device.count === 0) return apiError("Appareil introuvable", 404);
    return json({ ok: true });
  });
}

// DELETE — remove (unenroll) a device and its data
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId, deviceId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const existing = await prisma.device.findFirst({ where: { id: deviceId, childId } });
    if (!existing) return apiError("Appareil introuvable", 404);
    await prisma.device.delete({ where: { id: deviceId } });
    await audit(parent.id, "device.remove", existing.name);
    return json({ ok: true });
  });
}
