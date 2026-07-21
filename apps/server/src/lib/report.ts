import { prisma } from "./prisma";
import { localDateStringDaysAgo, startOfLocalDayMs, clampTzOffset } from "./localdate";

/**
 * Resolve the timezone offset (minutes to add to UTC) for a report. Prefer the
 * caller's `tz` query param; when it is ABSENT or unparseable, fall back to the
 * child device's last-reported offset — NOT UTC. Screen-time is bucketed by the
 * family's local day (that's how the agents write AppUsage.date), so defaulting a
 * tz-less request (e.g. from the mobile app) to UTC makes "today" the wrong day
 * for any non-UTC family. Note `Number(null)` is 0 (finite), so the param must be
 * null-checked explicitly rather than run straight through Number().
 */
export function resolveReportTz(tzParam: string | null, childTzOffset: number | null | undefined): number {
  const n = tzParam === null ? NaN : Number(tzParam);
  return Number.isFinite(n) ? clampTzOffset(n) : clampTzOffset(childTzOffset);
}

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

// "YYYY-MM-DD" for `daysAgo` days before now, in the family's local timezone
// (offset = minutes to add to UTC). AppUsage.date is written by the agents in
// that same local day, so the report window MUST bucket in local time too or a
// non-UTC family's current day is missing and a stale day is included.
export function dateStr(daysAgo: number, tzOffsetMinutes = 0, nowMs = Date.now()): string {
  return localDateStringDaysAgo(nowMs, daysAgo, tzOffsetMinutes);
}

/**
 * Aggregate a child's activity over the last `days` days (screen time, top apps,
 * categories, web, alerts). Shared by the report API route and the weekly email.
 * `tzOffsetMinutes` (the child's local-time offset) buckets the day window.
 */
export async function buildChildReport(childId: string, days: number, tzOffsetMinutes = 0): Promise<ChildReport> {
  const dates = Array.from({ length: days }, (_, i) => dateStr(days - 1 - i, tzOffsetMinutes));
  // Bound visits & alerts to the SAME window as the usage trend: from local
  // midnight of the first day shown (dates[0]) to now. The old `now - days*24h`
  // started at the current wall-clock time `days` ago, so a report requested at
  // 20:00 pulled in ~an extra day of visits/alerts vs the `days` civil days of
  // screen-time — "12 alerts this week" could include alerts 7-8 days old.
  const since = new Date(startOfLocalDayMs(dates[0], tzOffsetMinutes));

  const [usage, visits, alerts] = await Promise.all([
    prisma.appUsage.findMany({ where: { childId, date: { in: dates } } }),
    prisma.webVisit.findMany({ where: { childId, ts: { gte: since } } }),
    prisma.alert.findMany({ where: { childId, ts: { gte: since } } }),
  ]);

  return aggregateReport({ usage, visits, alerts, dates, days });
}

// Pure aggregation (no DB) — unit-testable in isolation.
export type ReportInput = {
  usage: { date: string; appId: string; appName: string; category: string | null; seconds: number }[];
  visits: { domain: string; blocked: boolean }[];
  alerts: { type: string }[];
  dates: string[];
  days: number;
};

export function aggregateReport({ usage, visits, alerts, dates, days }: ReportInput): ChildReport {
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
