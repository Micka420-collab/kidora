import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { computeScreenTimeToday, localWeekday } from "@/lib/policy";
import { localDateString } from "@/lib/localdate";

type Ctx = { params: Promise<{ childId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const child = await prisma.child.findUnique({
      where: { id: childId },
      include: {
        devices: true,
        screenTime: true,
        webFilter: true,
        appRules: { orderBy: { appName: "asc" } },
        webRules: { orderBy: { value: "asc" } },
        geofences: true,
      },
    });
    if (!child) return json({ child: null });

    // Additive: today's screen-time allowance (parsed limit + bonus granted),
    // so clients can show "remaining today" without re-parsing the raw row.
    const today = localDateString(Date.now(), child.tzOffsetMinutes);
    const grants = await prisma.timeGrant.findMany({ where: { childId, date: today } });
    const bonusMinutes = grants.reduce((a, g) => a + g.minutes, 0);
    // Today's weekday in the family's local tz (not the server's UTC), so the
    // limit shown near local midnight is for the right day.
    const screenTimeToday = computeScreenTimeToday(child.screenTime, bonusMinutes, localWeekday(child.tzOffsetMinutes));

    return json({ child, screenTimeToday });
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  avatar: z.string().optional(),
  birthDate: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);

    const child = await prisma.child.update({
      where: { id: childId },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.avatar !== undefined && { avatar: parsed.data.avatar }),
        ...(parsed.data.birthDate !== undefined && {
          birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
        }),
      },
    });
    return json({ child });
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    await prisma.child.delete({ where: { id: childId } });
    return json({ ok: true });
  });
}
