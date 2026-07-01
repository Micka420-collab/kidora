import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { categorizeApp } from "@/lib/categories";
import { localDateString } from "@/lib/localdate";

type Ctx = { params: Promise<{ childId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    const child = await requireOwnedChild(parent.id, childId);
    const rules = await prisma.appRule.findMany({
      where: { childId },
      orderBy: { appName: "asc" },
    });
    // Today's usage per app (family-local day), so the UI can show "used X / limit".
    const today = localDateString(Date.now(), child.tzOffsetMinutes);
    const usage = await prisma.appUsage.groupBy({
      by: ["appId"],
      where: { childId, date: today },
      _sum: { seconds: true },
    });
    const usageToday: Record<string, number> = {};
    for (const u of usage) usageToday[u.appId] = u._sum.seconds ?? 0;
    return json({ rules, usageToday });
  });
}

const upsertSchema = z.object({
  appId: z.string().min(1),
  appName: z.string().min(1),
  action: z.enum(["allow", "block", "limit"]),
  dailyLimitMinutes: z.number().int().min(0).max(1440).nullable().optional(),
});

// PUT upserts an app rule for the child.
export async function PUT(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const parsed = upsertSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);
    const { appId, appName, action, dailyLimitMinutes } = parsed.data;

    const rule = await prisma.appRule.upsert({
      where: { childId_appId: { childId, appId } },
      create: {
        childId,
        appId,
        appName,
        action,
        dailyLimitMinutes: dailyLimitMinutes ?? null,
        category: categorizeApp(appId, appName),
      },
      update: {
        appName,
        action,
        dailyLimitMinutes: dailyLimitMinutes ?? null,
      },
    });
    return json({ rule });
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const appId = new URL(req.url).searchParams.get("appId");
    if (!appId) return apiError("appId requis", 400);
    await prisma.appRule.deleteMany({ where: { childId, appId } });
    return json({ ok: true });
  });
}
