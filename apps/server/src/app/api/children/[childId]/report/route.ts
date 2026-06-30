import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, clampLimit } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { buildChildReport, dateStr } from "@/lib/report";
import { hourHistogram } from "@/lib/hourly";

type Ctx = { params: Promise<{ childId: string }> };

// GET /api/children/:id/report?days=7
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    // clampLimit guards NaN/negative/oversized (?days=abc no longer 500s).
    const days = clampLimit(new URL(req.url).searchParams.get("days"), 7, 31);
    const report = await buildChildReport(childId, days);

    // Total screen time over the *previous* equal-length window, for a delta;
    // and a by-hour activity histogram over the window (capped for safety).
    const [prevAgg, events] = await Promise.all([
      prisma.appUsage.aggregate({
        _sum: { seconds: true },
        where: { childId, date: { gte: dateStr(2 * days - 1), lt: dateStr(days - 1) } },
      }),
      prisma.activityEvent.findMany({
        where: { childId, ts: { gte: new Date(Date.now() - days * 86400_000) } },
        select: { ts: true },
        orderBy: { ts: "desc" },
        take: 10000,
      }),
    ]);
    return json({
      ...report,
      prevTotalSeconds: prevAgg._sum.seconds ?? 0,
      byHour: hourHistogram(events.map((e) => e.ts)),
    });
  });
}
