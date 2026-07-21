import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, clampLimit } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { buildChildReport, dateStr, resolveReportTz } from "@/lib/report";
import { hourHistogram } from "@/lib/hourly";

type Ctx = { params: Promise<{ childId: string }> };

// GET /api/children/:id/report?days=7
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    const child = await requireOwnedChild(parent.id, childId);

    const url = new URL(req.url);
    // clampLimit guards NaN/negative/oversized (?days=abc no longer 500s).
    const days = clampLimit(url.searchParams.get("days"), 7, 31);
    // Timezone offset (minutes to add to UTC) so day-bucketing & the by-hour
    // histogram reflect the family's local time. Falls back to the child's own
    // reported offset when the caller omits `tz` (the mobile app does), so a
    // non-UTC family's "today" isn't silently computed in UTC.
    const tzOffset = resolveReportTz(url.searchParams.get("tz"), child.tzOffsetMinutes);
    const report = await buildChildReport(childId, days, tzOffset);

    // Total screen time over the *previous* equal-length window, for a delta;
    // and a by-hour activity histogram over the window (capped for safety).
    // Prev-window day bounds use the same local tz as the report itself.
    const [prevAgg, events] = await Promise.all([
      prisma.appUsage.aggregate({
        _sum: { seconds: true },
        where: { childId, date: { gte: dateStr(2 * days - 1, tzOffset), lt: dateStr(days - 1, tzOffset) } },
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
      byHour: hourHistogram(events.map((e) => e.ts), tzOffset),
    });
  });
}
