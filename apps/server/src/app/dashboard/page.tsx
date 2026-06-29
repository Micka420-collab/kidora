import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentParent } from "@/lib/auth";
import { accessibleChildWhere } from "@/lib/guard";
import { getLocale, getDict } from "@/lib/i18n";
import { formatDuration, relativeTime } from "@/lib/format";
import { FamilyPause } from "@/components/family-pause";
import { Onboarding } from "@/components/onboarding";
import { CATEGORY_META, type Category } from "@/lib/categories";
import {
  Smartphone,
  Clock,
  ShieldAlert,
  ArrowRight,
  Plus,
  Circle,
} from "lucide-react";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function OverviewPage() {
  const parent = (await getCurrentParent())!;
  const tt = getDict(await getLocale());
  const kids = await prisma.child.findMany({
    where: accessibleChildWhere(parent.id),
    orderBy: { createdAt: "asc" },
    include: { devices: true },
  });

  const usageToday = await prisma.appUsage.groupBy({
    by: ["childId"],
    where: { childId: { in: kids.map((k) => k.id) }, date: today() },
    _sum: { seconds: true },
  });
  const usageMap = new Map(usageToday.map((u) => [u.childId, u._sum.seconds ?? 0]));

  const topApps = await prisma.appUsage.groupBy({
    by: ["category"],
    where: { childId: { in: kids.map((k) => k.id) }, date: today() },
    _sum: { seconds: true },
  });

  const recentAlerts = await prisma.alert.findMany({
    where: { parentId: parent.id },
    orderBy: { ts: "desc" },
    take: 6,
    include: { child: { select: { name: true, avatar: true } } },
  });

  const totalDevices = kids.reduce((a, k) => a + k.devices.length, 0);
  const onlineDevices = kids.reduce((a, k) => a + k.devices.filter((d) => d.online).length, 0);
  const totalToday = [...usageMap.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tt.overview.hello}, {parent.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-muted">{tt.overview.todayActivity}</p>
        </div>
        <div className="flex gap-2">
          {kids.length > 0 && <FamilyPause anyActive={kids.some((k) => !k.paused)} />}
          <Link href="/dashboard/children/new" className="btn btn-primary">
            <Plus size={16} /> {tt.nav.addChild}
          </Link>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile icon={Clock} label={tt.overview.screenTimeToday} value={formatDuration(totalToday)} tint="bg-brand-50 text-brand-600" />
        <Tile icon={Smartphone} label={tt.overview.devicesOnline} value={`${onlineDevices} / ${totalDevices}`} tint="bg-emerald-50 text-emerald-600" />
        <Tile icon={ShieldAlert} label={tt.overview.unreadAlerts} value={String(recentAlerts.filter((a) => !a.read).length)} tint="bg-amber-50 text-amber-600" />
      </div>

      {/* Children */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">{tt.nav.myChildren}</h2>
        {kids.length === 0 ? (
          <Onboarding t={tt.onboarding} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {kids.map((k) => {
              const secs = usageMap.get(k.id) ?? 0;
              const online = k.devices.filter((d) => d.online).length;
              return (
                <Link key={k.id} href={`/dashboard/children/${k.id}`} className="card group p-5 transition hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-2xl">{k.avatar ?? "🧒"}</span>
                      <div>
                        <div className="flex items-center gap-2 font-bold">
                          {k.name}
                          {k.paused && <span className="badge bg-amber-100 text-amber-700">⏸ En pause</span>}
                        </div>
                        <div className="text-xs text-muted">{k.devices.length} appareil(s) · {online} en ligne</div>
                      </div>
                    </div>
                    <ArrowRight size={18} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
                  </div>
                  <div className="mt-4 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-muted">
                      <Clock size={15} /> {formatDuration(secs)} aujourd'hui
                    </div>
                    <div className="flex items-center gap-1.5 text-muted">
                      <Circle size={9} className={online ? "fill-emerald-500 text-emerald-500" : "fill-slate-300 text-slate-300"} />
                      {online ? "Actif" : "Hors ligne"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category breakdown */}
        <div className="card p-5">
          <h2 className="mb-4 text-lg font-semibold">Catégories aujourd'hui</h2>
          {topApps.filter((t) => t._sum.seconds).length === 0 ? (
            <p className="text-sm text-muted">Aucune activité enregistrée aujourd'hui.</p>
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
                <li key={a.id} className="flex items-start gap-3">
                  <span className="mt-0.5 text-lg">{a.child.avatar ?? "🧒"}</span>
                  <div className="flex-1">
                    <div className="text-sm">{a.message}</div>
                    <div className="text-xs text-muted">{a.child.name} · {relativeTime(a.ts)}</div>
                  </div>
                  {!a.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-red-500" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, tint }: { icon: typeof Clock; label: string; value: string; tint: string }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`grid h-12 w-12 place-items-center rounded-xl ${tint}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </div>
  );
}
