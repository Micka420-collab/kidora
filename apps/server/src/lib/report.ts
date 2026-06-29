import { prisma } from "./prisma";

export type ChildReport = {
  days: number;
  totalSeconds: number;
  avgPerDaySeconds: number;
  trend: { date: string; seconds: number }[];
  topApps: { appName: string; category: string | null; seconds: number }[];
  byCategory: { category: string; seconds: number }[];
  web: {
    totalVisits: number;
    blockedVisits: number;
    topDomains: { domain: string; count: number; blocked: number }[];
  };
  alerts: { total: number; byType: { type: string; count: number }[] };
};

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Aggregate a child's activity over the last `days` days (screen time, top apps,
 * categories, web, alerts). Shared by the report API route and the weekly email.
 */
export async function buildChildReport(childId: string, days: number): Promise<ChildReport> {
  const dates = Array.from({ length: days }, (_, i) => dateStr(days - 1 - i));
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [usage, visits, alerts] = await Promise.all([
    prisma.appUsage.findMany({ where: { childId, date: { in: dates } } }),
    prisma.webVisit.findMany({ where: { childId, ts: { gte: since } } }),
    prisma.alert.findMany({ where: { childId, ts: { gte: since } } }),
  ]);

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

  const byDomain = new Map<string, { count: number; blocked: number }>();
  let blockedVisits = 0;
  for (const v of visits) {
    const d = byDomain.get(v.domain) ?? { count: 0, blocked: 0 };
    d.count++;
    if (v.blocked) { d.blocked++; blockedVisits++; }
    byDomain.set(v.domain, d);
  }

  const alertsByType = new Map<string, number>();
  for (const a of alerts) alertsByType.set(a.type, (alertsByType.get(a.type) ?? 0) + 1);

  return {
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
  };
}
