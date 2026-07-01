import Link from "next/link";
import { Smartphone, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDuration, relativeTime } from "@/lib/format";
import { CATEGORY_META, type Category } from "@/lib/categories";
import { isBedtimeNowTz, localWeekday } from "@/lib/policy";
import { localDateString, localDateStringDaysAgo } from "@/lib/localdate";
import { TimeRequestsCard } from "@/components/time-requests-card";
import { LiveNow } from "@/components/live-now";
import { RemoteActions } from "@/components/remote-actions";

// Local-day window in the family's timezone. Module-scope so Date.now() stays out
// of the component render (react-hooks/purity). Usage/grants are keyed by local
// day, so "today", the 7-day window and the weekday must all use the same tz.
function localWindow(tz: number): { dates: string[]; today: string; weekday: string } {
  const now = Date.now();
  return {
    dates: Array.from({ length: 7 }, (_, i) => localDateStringDaysAgo(now, 6 - i, tz)),
    today: localDateString(now, tz),
    weekday: localWeekday(tz, now),
  };
}
function safeParse<T>(raw: string | undefined | null, fb: T): T {
  if (!raw) return fb;
  try { return JSON.parse(raw) as T; } catch { return fb; }
}

export default async function ChildOverview({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { tzOffsetMinutes: true } });
  const tz = child?.tzOffsetMinutes ?? 0;
  const { dates, today, weekday } = localWindow(tz);

  const [usage, screenTime, recent, grants, deviceCount] = await Promise.all([
    prisma.appUsage.findMany({ where: { childId, date: { in: dates } } }),
    prisma.screenTimeRule.findUnique({ where: { childId } }),
    prisma.activityEvent.findMany({
      where: { childId },
      orderBy: { ts: "desc" },
      take: 8,
      include: { device: { select: { name: true } } },
    }),
    prisma.timeGrant.findMany({ where: { childId, date: today } }),
    prisma.device.count({ where: { childId } }),
  ]);
  const bonusMin = grants.reduce((a, g) => a + g.minutes, 0);

  const byDay = new Map<string, number>(dates.map((d) => [d, 0]));
  const byApp = new Map<string, { name: string; category: string | null; seconds: number }>();
  for (const u of usage) {
    byDay.set(u.date, (byDay.get(u.date) ?? 0) + u.seconds);
    if (u.date === today) {
      const cur = byApp.get(u.appId) ?? { name: u.appName, category: u.category, seconds: 0 };
      cur.seconds += u.seconds;
      byApp.set(u.appId, cur);
    }
  }
  const totalToday = byApp.size ? [...byApp.values()].reduce((a, b) => a + b.seconds, 0) : 0;
  const limits = safeParse<Record<string, number>>(screenTime?.dailyLimits, {});
  // A free day (no base limit) stays free even with a bonus grant — mirrors the
  // server helper, the enforcer and the mobile client.
  const baseLimit = limits[weekday] ?? 0;
  const limitToday = baseLimit > 0 ? baseLimit + bonusMin : 0;
  const limitSecs = limitToday * 60;
  const pct = limitSecs ? Math.min(100, Math.round((totalToday / limitSecs) * 100)) : 0;
  const remainingSecs = limitSecs - totalToday;
  const bedtimes = safeParse<{ days: string[]; start: string; end: string }[]>(screenTime?.bedtimes, []);
  const inBedtime = isBedtimeNowTz(bedtimes, tz);
  const maxDay = Math.max(1, ...[...byDay.values()]);

  return (
    <div className="space-y-6">
      {deviceCount === 0 && (
        <div className="card flex flex-col items-start gap-3 border-brand-200 bg-brand-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700"><Smartphone size={20} /></span>
            <div>
              <div className="font-semibold">Aucun appareil connecté</div>
              <div className="text-sm text-muted">Installez l&apos;agent Kidora (PC, Android ou iPhone) pour commencer la protection.</div>
            </div>
          </div>
          <Link href={`/dashboard/children/${childId}/devices`} className="btn btn-primary shrink-0">
            Ajouter un appareil <ArrowRight size={16} />
          </Link>
        </div>
      )}

      <LiveNow childId={childId} />

      {deviceCount > 0 && <RemoteActions childId={childId} />}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Today vs limit */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-muted">Aujourd'hui</h3>
          <div className="mt-2 text-3xl font-bold">{formatDuration(totalToday)}</div>
          {limitToday > 0 ? (
            <>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-brand-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1.5 text-xs text-muted">
                Limite : {formatDuration(limitSecs)} · {pct}%
                {bonusMin > 0 && <span className="text-emerald-600"> (dont +{bonusMin} min bonus)</span>}
              </div>
              <div className={`mt-1 text-sm font-semibold ${remainingSecs > 0 ? "text-emerald-600" : "text-red-600"}`}>
                {remainingSecs > 0
                  ? `Il reste ${formatDuration(remainingSecs)}`
                  : remainingSecs === 0
                    ? "Limite atteinte"
                    : `Limite dépassée de ${formatDuration(-remainingSecs)}`}
              </div>
            </>
          ) : (
            <div className="mt-3 text-xs text-muted">Aucune limite définie</div>
          )}
          {inBedtime && (
            <div className="mt-3 badge bg-indigo-100 text-indigo-700">🌙 Heure du coucher active</div>
          )}
        </div>

        {/* 7-day trend */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-muted">7 derniers jours</h3>
          <div className="mt-4 flex h-32 items-end gap-2">
            {dates.map((d) => {
              const v = byDay.get(d) ?? 0;
              const h = Math.round((v / maxDay) * 100);
              const wd = new Date(d).toLocaleDateString("fr-FR", { weekday: "short" });
              return (
                <div key={d} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-md bg-brand-400 transition-all hover:bg-brand-500"
                      style={{ height: `${Math.max(h, 3)}%` }}
                      title={formatDuration(v)}
                    />
                  </div>
                  <span className="text-[10px] text-muted">{wd}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <TimeRequestsCard childId={childId} />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Top apps */}
        <div className="card p-5">
          <h3 className="mb-4 text-base font-semibold">Applications aujourd'hui</h3>
          {byApp.size === 0 ? (
            <p className="text-sm text-muted">Aucune activité enregistrée aujourd'hui.</p>
          ) : (
            <div className="space-y-3">
              {[...byApp.values()]
                .sort((a, b) => b.seconds - a.seconds)
                .slice(0, 7)
                .map((a) => {
                  const meta = CATEGORY_META[(a.category as Category) ?? "unknown"] ?? CATEGORY_META.unknown;
                  const p = Math.round((a.seconds / Math.max(totalToday, 1)) * 100);
                  return (
                    <div key={a.name} className="flex items-center gap-3">
                      <span className="text-lg">{meta.emoji}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{a.name}</span>
                          <span className="text-muted">{formatDuration(a.seconds)}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${p}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card p-5">
          <h3 className="mb-4 text-base font-semibold">Activité récente</h3>
          {recent.length === 0 ? (
            <p className="text-sm text-muted">Aucune activité.</p>
          ) : (
            <ul className="space-y-3">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {e.blocked && <span className="badge bg-red-100 text-red-600">Bloqué</span>}
                    <span className="font-medium">{e.title ?? e.type}</span>
                    <span className="text-xs text-muted">· {e.device.name}</span>
                  </div>
                  <span className="text-xs text-muted">{relativeTime(e.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
