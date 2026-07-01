import type { ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentParent } from "@/lib/auth";
import { accessibleChildWhere } from "@/lib/guard";
import { getLocale, getDict } from "@/lib/i18n";
import { formatDuration, relativeTime } from "@/lib/format";
import { FamilyPause } from "@/components/family-pause";
import { Onboarding } from "@/components/onboarding";
import { ChildrenGrid, type ChildCardData } from "@/components/children-grid";
import { CATEGORY_META, type Category } from "@/lib/categories";
import { isDeviceOnline } from "@/lib/device-status";
import { isPausedNow } from "@/lib/pause";
import { buildInsights, type Insight } from "@/lib/insights";
import { weekWindows } from "@/lib/insights";
import { localDateString } from "@/lib/localdate";
import { Smartphone, Clock, ShieldAlert, Plus } from "lucide-react";

// Date window for the "this week" vs "last week" insights (kept in a helper so
// the impure Date calls stay out of the component render body).
// Module scope so the react-hooks/purity rule doesn't flag Date.now() in render.
// Uses the shared, tested weekWindows() so "this week vs last week" compares two
// equal-length 7-day windows (the old d7/d14 made "this week" 8 days).
function overviewWindows() {
  const now = Date.now();
  return { ...weekWindows(now), weekAgo: new Date(now - 7 * 86400000), now };
}

export default async function OverviewPage() {
  const parent = (await getCurrentParent())!;
  const locale = await getLocale();
  const tt = getDict(locale);
  const kids = await prisma.child.findMany({
    where: accessibleChildWhere(parent.id),
    orderBy: { createdAt: "asc" },
    include: { devices: true },
  });

  const kidIds = kids.map((k) => k.id);
  const { curFrom, prevFrom, weekAgo, now: todayNow } = overviewWindows();
  // "Today" per child in ITS local timezone (families can span zones); each
  // usage row (dated in the device's local day) is matched to its own child.
  const todayWhere = kids.length
    ? { OR: kids.map((k) => ({ childId: k.id, date: localDateString(todayNow, k.tzOffsetMinutes) })) }
    : { childId: { in: kidIds } };
  // All independent dashboard queries in a single round-trip.
  const [usageToday, topApps, recentAlerts, unreadCount, recentActivity, thisWeekAgg, lastWeekAgg, catAgg, dayAgg, alertsThisWeek] = await Promise.all([
    prisma.appUsage.groupBy({
      by: ["childId"],
      where: todayWhere,
      _sum: { seconds: true },
    }),
    prisma.appUsage.groupBy({
      by: ["category"],
      where: todayWhere,
      _sum: { seconds: true },
    }),
    prisma.alert.findMany({
      where: { parentId: parent.id },
      orderBy: { ts: "desc" },
      take: 6,
      include: { child: { select: { name: true, avatar: true } } },
    }),
    // Real unread total — the tile must not be capped at the 6 fetched above.
    prisma.alert.count({ where: { parentId: parent.id, read: false } }),
    prisma.activityEvent.findMany({
      where: { childId: { in: kidIds }, type: { in: ["app_open", "web_visit", "search", "blocked"] } },
      orderBy: { ts: "desc" },
      take: 8,
      select: { id: true, childId: true, type: true, title: true, ts: true },
    }),
    prisma.appUsage.aggregate({ _sum: { seconds: true }, where: { childId: { in: kidIds }, date: { gte: curFrom } } }),
    prisma.appUsage.aggregate({ _sum: { seconds: true }, where: { childId: { in: kidIds }, date: { gte: prevFrom, lt: curFrom } } }),
    prisma.appUsage.groupBy({ by: ["category"], _sum: { seconds: true }, where: { childId: { in: kidIds }, date: { gte: curFrom } } }),
    prisma.appUsage.groupBy({ by: ["date"], _sum: { seconds: true }, where: { childId: { in: kidIds }, date: { gte: curFrom } } }),
    prisma.alert.count({ where: { parentId: parent.id, ts: { gte: weekAgo } } }),
  ]);
  const usageMap = new Map(usageToday.map((u) => [u.childId, u._sum.seconds ?? 0]));
  const kidById = new Map(kids.map((k) => [k.id, k]));

  const totalDevices = kids.reduce((a, k) => a + k.devices.length, 0);
  const onlineDevices = kids.reduce((a, k) => a + k.devices.filter((d) => isDeviceOnline(d)).length, 0);
  const totalToday = [...usageMap.values()].reduce((a, b) => a + b, 0);

  // "This week" family insights (vs. the previous week) — from the queries above.
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
  const insights: Insight[] = kids.length
    ? buildInsights({
        thisWeekSeconds: thisWeekAgg._sum.seconds ?? 0,
        lastWeekSeconds: lastWeekAgg._sum.seconds ?? 0,
        topCategory,
        busiestDay,
        alertsThisWeek,
      })
    : [];
  const showInsights = insights.some((i) =>
    i.key === "screenTime" ? i.seconds > 0 : i.key === "alerts" ? i.count > 0 : false,
  );

  const childCards: ChildCardData[] = kids.map((k) => ({
    id: k.id,
    name: k.name,
    avatar: k.avatar,
    paused: isPausedNow(k.paused, k.pausedUntil),
    deviceCount: k.devices.length,
    onlineCount: k.devices.filter((d) => isDeviceOnline(d)).length,
    secondsToday: usageMap.get(k.id) ?? 0,
  }));

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tt.overview.hello}, {parent.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-muted">{tt.overview.todayActivity}</p>
        </div>
        <div className="flex gap-2">
          {kids.length > 0 && <FamilyPause anyActive={kids.some((k) => !isPausedNow(k.paused, k.pausedUntil))} />}
          <Link href="/dashboard/children/new" className="btn btn-primary">
            <Plus size={16} /> {tt.nav.addChild}
          </Link>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile icon={Clock} label={tt.overview.screenTimeToday} value={formatDuration(totalToday)} tint="bg-brand-50 text-brand-600" />
        <Tile icon={Smartphone} label={tt.overview.devicesOnline} value={`${onlineDevices} / ${totalDevices}`} tint="bg-emerald-50 text-emerald-600" href="/dashboard/devices" />
        <Tile icon={ShieldAlert} label={tt.overview.unreadAlerts} value={String(unreadCount)} tint="bg-amber-50 text-amber-600" href="/dashboard/alerts" />
      </div>

      {/* This-week insights */}
      {showInsights && (
        <div className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">{tt.overview.thisWeek}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {insights.map((i) => <InsightCell key={i.key} insight={i} t={tt.overview} locale={locale} />)}
          </div>
        </div>
      )}

      {/* Children */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">{tt.nav.myChildren}</h2>
        {kids.length === 0 ? (
          <Onboarding t={tt.onboarding} />
        ) : (
          <ChildrenGrid items={childCards} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category breakdown */}
        <div className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">{tt.overview.categoriesToday}</h2>
          {topApps.filter((t) => t._sum.seconds).length === 0 ? (
            <p className="text-sm text-muted">{tt.overview.noActivityToday}</p>
          ) : (
            <div className="space-y-3">
              {topApps
                .filter((t) => t._sum.seconds)
                .sort((a, b) => (b._sum.seconds ?? 0) - (a._sum.seconds ?? 0))
                .slice(0, 6)
                .map((t) => {
                  const meta = CATEGORY_META[(t.category as Category) ?? "unknown"] ?? CATEGORY_META.unknown;
                  const pct = Math.round(((t._sum.seconds ?? 0) / Math.max(totalToday, 1)) * 100);
                  return (
                    <div key={t.category ?? "x"}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{meta.emoji} {meta.label}</span>
                        <span className="text-muted">{formatDuration(t._sum.seconds ?? 0)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Recent alerts */}
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{tt.overview.recentAlerts}</h2>
            <Link href="/dashboard/alerts" className="text-sm font-semibold text-brand-600">{tt.overview.seeAll}</Link>
          </div>
          {recentAlerts.length === 0 ? (
            <p className="text-sm text-muted">{tt.overview.allGood}</p>
          ) : (
            <ul className="space-y-3">
              {recentAlerts.map((a) => (
                <li key={a.id}>
                  <Link href={`/dashboard/children/${a.childId}`} className="group flex items-start gap-3">
                    <span className="mt-0.5 text-lg">{a.child.avatar ?? "🧒"}</span>
                    <div className="flex-1">
                      <div className="text-sm group-hover:text-brand-700">{a.message}</div>
                      <div className="text-xs text-muted">{a.child.name} · {relativeTime(a.ts)}</div>
                    </div>
                    {!a.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-red-500" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {recentActivity.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">{tt.overview.recentActivity}</h2>
          <ul className="space-y-2.5">
            {recentActivity.map((e) => {
              const kid = kidById.get(e.childId);
              const icon = e.type === "web_visit" ? "🌐" : e.type === "search" ? "🔍" : e.type === "blocked" ? "🚫" : "📱";
              return (
                <li key={e.id}>
                  <Link href={`/dashboard/children/${e.childId}`} className="group flex items-center gap-3">
                    <span className="text-base">{icon}</span>
                    <span className="min-w-0 flex-1 truncate text-sm group-hover:text-brand-700">{e.title ?? e.type}</span>
                    <span className="shrink-0 text-xs text-muted">{kid?.avatar ?? "🧒"} {kid?.name} · {relativeTime(e.ts)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Tile({ icon: Icon, label, value, tint, href }: { icon: typeof Clock; label: string; value: string; tint: string; href?: string }) {
  const body = (
    <>
      <div className={`grid h-12 w-12 place-items-center rounded-xl ${tint}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="card flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
        {body}
      </Link>
    );
  }
  return <div className="card flex items-center gap-4 p-5">{body}</div>;
}

function InsightCell({ insight, t, locale }: {
  insight: Insight;
  t: { iScreenTime: string; iTopCategory: string; iBusiestDay: string; iAlerts: string; iVsLastWeek: string; iStable: string };
  locale: string;
}) {
  const loc = locale === "en" ? "en-US" : "fr-FR";
  let icon = "📊";
  let label = "";
  let value = "";
  let sub: ReactNode = null;

  if (insight.key === "screenTime") {
    icon = "⏱️";
    label = t.iScreenTime;
    value = formatDuration(insight.seconds);
    if (insight.deltaPct != null && insight.direction !== "flat") {
      const up = insight.direction === "up";
      sub = <span className={up ? "font-medium text-amber-600" : "font-medium text-emerald-600"}>{up ? "▲" : "▼"} {Math.abs(insight.deltaPct)}% {t.iVsLastWeek}</span>;
    } else {
      sub = <span className="text-muted">{t.iStable}</span>;
    }
  } else if (insight.key === "topCategory") {
    const meta = CATEGORY_META[insight.category as Category] ?? CATEGORY_META.unknown;
    icon = meta.emoji;
    label = t.iTopCategory;
    value = meta.label;
    sub = <span className="text-muted">{formatDuration(insight.seconds)}</span>;
  } else if (insight.key === "busiestDay") {
    icon = "📅";
    label = t.iBusiestDay;
    const wd = new Date(insight.date + "T00:00:00").toLocaleDateString(loc, { weekday: "long" });
    value = wd.charAt(0).toUpperCase() + wd.slice(1);
    sub = <span className="text-muted">{formatDuration(insight.seconds)}</span>;
  } else {
    icon = "🔔";
    label = t.iAlerts;
    value = String(insight.count);
  }

  return (
    <div>
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs">{sub}</div>}
    </div>
  );
}
