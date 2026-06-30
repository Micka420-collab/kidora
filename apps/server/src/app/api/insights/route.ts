import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";
import { requireParent, withGuard, accessibleChildWhere } from "@/lib/guard";
import { buildInsights, weekWindows } from "@/lib/insights";

// GET /api/insights — family "this week" insights (screen time + delta, top
// category, busiest day, alerts). Mirrors the dashboard overview, for the
// mobile companion.
export async function GET() {
  return withGuard(async () => {
    const parent = await requireParent();
    const kids = await prisma.child.findMany({
      where: accessibleChildWhere(parent.id),
      select: { id: true },
    });
    const kidIds = kids.map((k) => k.id);

    const now = Date.now();
    // Equal-length 7-day windows so the week-over-week delta isn't biased.
    const { curFrom, prevFrom, prevTo } = weekWindows(now);
    const weekAgo = new Date(now - 7 * 86400_000);

    const [thisWeekAgg, lastWeekAgg, catAgg, dayAgg, alertsThisWeek] = await Promise.all([
      prisma.appUsage.aggregate({ _sum: { seconds: true }, where: { childId: { in: kidIds }, date: { gte: curFrom } } }),
      prisma.appUsage.aggregate({ _sum: { seconds: true }, where: { childId: { in: kidIds }, date: { gte: prevFrom, lt: prevTo } } }),
      prisma.appUsage.groupBy({ by: ["category"], _sum: { seconds: true }, where: { childId: { in: kidIds }, date: { gte: curFrom } } }),
      prisma.appUsage.groupBy({ by: ["date"], _sum: { seconds: true }, where: { childId: { in: kidIds }, date: { gte: curFrom } } }),
      prisma.alert.count({ where: { parentId: parent.id, ts: { gte: weekAgo } } }),
    ]);

    let topCategory: { category: string; seconds: number } | null = null;
    for (const c of catAgg) {
      const s = c._sum.seconds ?? 0;
      if (c.category && s > (topCategory?.seconds ?? 0)) topCategory = { category: c.category, seconds: s };
    }
    let busiestDay: { date: string; seconds: number } | null = null;
    for (const d of dayAgg) {
      const s = d._sum.seconds ?? 0;
      if (s > (busiestDay?.seconds ?? 0)) busiestDay = { date: d.date, seconds: s };
    }

    const thisWeekSeconds = thisWeekAgg._sum.seconds ?? 0;
    const lastWeekSeconds = lastWeekAgg._sum.seconds ?? 0;
    const insights = kidIds.length
      ? buildInsights({ thisWeekSeconds, lastWeekSeconds, topCategory, busiestDay, alertsThisWeek })
      : [];

    return json({ insights, thisWeekSeconds, lastWeekSeconds, alertsThisWeek });
  });
}
