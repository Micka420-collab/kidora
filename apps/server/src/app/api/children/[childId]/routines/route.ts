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
    const routines = await prisma.routine.findMany({
      where: { childId },
      orderBy: { createdAt: "asc" },
    });
    return json({ routines });
  });
}

const upsert = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(60),
  enabled: z.boolean().optional(),
  days: z.array(z.string()),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  blockedAppIds: z.array(z.string()),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const parsed = upsert.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);
    const d = parsed.data;
    const data = {
      name: d.name,
      enabled: d.enabled ?? true,
      days: JSON.stringify(d.days),
      start: d.start,
      end: d.end,
      blockedAppIds: JSON.stringify(d.blockedAppIds),
    };
    if (d.id) {
      // Ownership scope: ensure the routine belongs to THIS child (prevents IDOR
      // via a guessed/foreign routine id with an owned childId).
      const owned = await prisma.routine.findFirst({ where: { id: d.id, childId } });
      if (!owned) return apiError("Routine introuvable", 404);
      const routine = await prisma.routine.update({ where: { id: d.id }, data });
      return json({ routine });
    }
    const routine = await prisma.routine.create({ data: { childId, ...data } });
    return json({ routine });
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return apiError("id requis", 400);
    await prisma.routine.deleteMany({ where: { id, childId } });
    return json({ ok: true });
  });
}
