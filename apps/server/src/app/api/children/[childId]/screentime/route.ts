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

// Real clock values only: the old \d{2}:\d{2} accepted 24:00 / 99:99, which the
// schedule math silently read as an OVERNIGHT window shifted to the wrong day.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const putSchema = z.object({
  enabled: z.boolean().optional(),
  dailyLimits: z.record(z.string(), z.number().int().min(0).max(1440)).optional(),
  bedtimes: z
    .array(
      z.object({
        // Never store an empty days list: the engine reads [] as EVERY day, so
        // "uncheck all to disable" silently armed the window 7/7. Clients drop
        // day-less windows instead (the mobile app already did).
        days: z.array(z.string()).min(1),
        start: z.string().regex(HHMM),
        end: z.string().regex(HHMM),
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
