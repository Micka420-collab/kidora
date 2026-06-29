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
    const keywords = await prisma.watchedKeyword.findMany({
      where: { childId },
      orderBy: { createdAt: "desc" },
    });
    return json({ keywords });
  });
}

const addSchema = z.object({ term: z.string().min(2).max(60) });

export async function POST(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const parsed = addSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);
    const term = parsed.data.term.trim().toLowerCase();
    const keyword = await prisma.watchedKeyword.upsert({
      where: { childId_term: { childId, term } },
      create: { childId, term },
      update: {},
    });
    return json({ keyword });
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return apiError("id requis", 400);
    await prisma.watchedKeyword.deleteMany({ where: { id, childId } });
    return json({ ok: true });
  });
}
