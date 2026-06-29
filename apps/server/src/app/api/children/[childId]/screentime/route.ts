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
    const rule = await prisma.screenTimeRule.findUnique({ where: { childId } });
    return json({ screenTime: rule });
  });
}

const putSchema = z.object({
  enabled: z.boolean().optional(),
  dailyLimits: z.record(z.string(), z.number().int().min(0).max(1440)).optional(),
  bedtimes: z
    .array(
      z.object({
        days: z.array(z.string()),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .optional(),
});

export async function PUT(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const parsed = putSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);

    const rule = await prisma.screenTimeRule.upsert({
      where: { childId },
      create: {
        childId,
        enabled: parsed.data.enabled ?? true,
        dailyLimits: JSON.stringify(parsed.data.dailyLimits ?? {}),
        bedtimes: JSON.stringify(parsed.data.bedtimes ?? []),
      },
      update: {
        ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled }),
        ...(parsed.data.dailyLimits !== undefined && {
          dailyLimits: JSON.stringify(parsed.data.dailyLimits),
        }),
        ...(parsed.data.bedtimes !== undefined && {
          bedtimes: JSON.stringify(parsed.data.bedtimes),
        }),
      },
    });
    return json({ screenTime: rule });
  });
}
