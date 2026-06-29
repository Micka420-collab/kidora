import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";

type Ctx = { params: Promise<{ childId: string }> };

function dateStr(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// GET /api/children/:id/report?days=7
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 7), 1), 31);
    const dates = Array.from({ length: days }, (_, i) => dateStr(days - 1 - i));
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [usage, visits, alerts] = await Promise.all([
      prisma.appUsage.findMany({ where: { childId, date: { in: dates } } }),
      prisma.webVisit.findMany({ where: { childId, ts: { gte: since } } }),
      prisma.alert.findMany({ where: { childId, ts: { gte: since } } }),
    ]);

    // by day
    const byDay = new Map<string, number>(dates.map((d) => [d, 0]));
    const byApp = new Map<string, { appName: string; category: string | null; seconds: number }>();
    const byCategory = new Map<string, number>();
    for (const u of usage) {
      byDay.set(u.date, (byDay.get(u.date) ?? 0) + u.seconds);
      const a = byApp.get(u.appId) ?? { appName: u.appName, category: u.category, seconds: 0 };
      a.seconds += u.seconds;
      byApp.set(u.appId, a);
      const cat = u.category ?? "unknown";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + u.seconds);
    }

    const totalSeconds = [...byDay.values()].reduce((a, b) => a + b, 0);

    // web
    const byDomain = new Map<string, { count: number; blocked: number }>();
    let blockedVisits = 0;
    for (const v of visits) {
      const d = byDomain.get(v.domain) ?? { count: 0, blocked: 0 };
      d.count++;
      if (v.blocked) { d.blocked++; blockedVisits++; }
      byDomain.set(v.domain, d);
    }

    // alerts by type
    const alertsByType = new Map<string, number>();
    for (const a of alerts) alertsByType.set(a.type, (alertsByType.get(a.type) ?? 0) + 1);

    return json({
      days,
      totalSeconds,
      avgPerDaySeconds: Math.round(totalSeconds / days),
      trend: dates.map((d) => ({ date: d, seconds: byDay.get(d) ?? 0 })),
      topApps: [...byApp.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 10),
      byCategory: [...byCategory.entries()].map(([category, seconds]) => ({ category, seconds })).sort((a, b) => b.seconds - a.seconds),
      web: {
        totalVisits: visits.length,
        blockedVisits,
        topDomains: [...byDomain.entries()].map(([domain, v]) => ({ domain, ...v })).sort((a, b) => b.count - a.count).slice(0, 10),
      },
      alerts: {
        total: alerts.length,
        byType: [...alertsByType.entries()].map(([type, count]) => ({ type, count })),
      },
    });
  });
}
