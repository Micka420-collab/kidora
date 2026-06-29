import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { normalizeDomain } from "@/lib/categories";

type Ctx = { params: Promise<{ childId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const rules = await prisma.webRule.findMany({
      where: { childId },
      orderBy: [{ kind: "asc" }, { value: "asc" }],
    });
    return json({ rules });
  });
}

const addSchema = z.object({
  kind: z.enum(["domain", "category"]),
  value: z.string().min(1),
  action: z.enum(["allow", "block"]),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const parsed = addSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);
    const value =
      parsed.data.kind === "domain"
        ? normalizeDomain(parsed.data.value)
        : parsed.data.value.toLowerCase();

    const rule = await prisma.webRule.upsert({
      where: {
        childId_kind_value: { childId, kind: parsed.data.kind, value },
      },
      create: { childId, kind: parsed.data.kind, value, action: parsed.data.action },
      update: { action: parsed.data.action },
    });
    return json({ rule });
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return apiError("id requis", 400);
    await prisma.webRule.deleteMany({ where: { id, childId } });
    return json({ ok: true });
  });
}
