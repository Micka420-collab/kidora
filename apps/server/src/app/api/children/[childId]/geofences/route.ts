import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";

type Ctx = { params: Promise<{ childId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const geofences = await prisma.geofence.findMany({
      where: { childId },
      orderBy: { createdAt: "asc" },
    });
    return json({ geofences });
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z.number().int().min(50).max(5000).optional(),
  notifyOnEnter: z.boolean().optional(),
  notifyOnExit: z.boolean().optional(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const parsed = createSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);

    const geofence = await prisma.geofence.create({
      data: {
        childId,
        name: parsed.data.name,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        radius: parsed.data.radius ?? 150,
        notifyOnEnter: parsed.data.notifyOnEnter ?? true,
        notifyOnExit: parsed.data.notifyOnExit ?? true,
      },
    });
    return json({ geofence });
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return apiError("id requis", 400);
    await prisma.geofence.deleteMany({ where: { id, childId } });
    return json({ ok: true });
  });
}
