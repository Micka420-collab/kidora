"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { formatDuration } from "@/lib/format";
import { CATEGORY_META, type Category } from "@/lib/categories";
import { useT } from "@/components/i18n-provider";
import { ErrorCard } from "@/components/error-card";
import { AiSummaryCard } from "@/components/ai-summary-card";
import { Loader2, Clock, Ban, Globe, BellRing, Download } from "lucide-react";

type Report = {
  days: number;
  totalSeconds: number;
  prevTotalSeconds?: number;
  avgPerDaySeconds: number;
  trend: { date: string; seconds: number }[];
  byHour?: number[];
  topApps: { appName: string; category: string | null; seconds: number }[];
  byCategory: { category: string; seconds: number }[];
  web: { totalVisits: number; blockedVisits: number; topDomains: { domain: string; count: number; blocked: number }[] };
  alerts: { total: number; byType: { type: string; count: number }[] };
};

const DAYS_KEY = "kidora_report_days";

// Minutes to add to UTC to reach the viewer's local time (module-scope so the
// react-hooks/purity rule doesn't flag `new Date()` in render). Sent to the
// report API so the by-hour histogram is bucketed in the family's timezone.
function localTzOffset(): number {
  return -new Date().getTimezoneOffset();
}

export default function ReportsTab() {
  const { childId } = useParams<{ childId: string }>();
  const { t: tr } = useT();
  const t = tr.reports;
  const [days, setDays] = useState(7);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Restore the parent's preferred range on mount (effect → no SSR/hydration risk).
  useEffect(() => {
    const saved = Number(localStorage.getItem(DAYS_KEY));
    if ([7, 14, 30].includes(saved)) setDays(saved);
  }, []);

  function chooseDays(d: number) {
    setDays(d);
    try { localStorage.setItem(DAYS_KEY, String(d)); } catch { /* storage unavailable */ }
  }

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    api.get<Report>(`/api/children/${childId}/report?days=${days}&tz=${localTzOffset()}`)
      .then((r) => setReport(r))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [childId, days]);
  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!report) return;
    const rows = [
      ["Type", "Nom", "Valeur"],
      ...report.trend.map((t) => ["jour", t.date, String(Math.round(t.seconds / 60)) + " min"]),
      ...report.topApps.map((a) => ["app", a.appName, String(Math.round(a.seconds / 60)) + " min"]),
      ...report.web.topDomains.map((d) => ["domaine", d.domain, `${d.count} visites (${d.blocked} bloquées)`]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kidora-rapport-${days}j.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>;
  if (error) return <ErrorCard onRetry={load} />;
  if (!report) return null;

  const maxDay = Math.max(1, ...report.trend.map((t) => t.seconds));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {[7, 14, 30].map((d) => (
            <button key={d} onClick={() => chooseDays(d)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${days === d ? "bg-brand-600 text-white" : "border bg-white text-slate-600 hover:bg-slate-50"}`}>
              {d} {t.days}
            </button>
          ))}
        </div>
        <button className="btn btn-outline" onClick={exportCsv}><Download size={16} /> {t.exportCsv}</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Clock} tint="bg-brand-50 text-brand-600" value={formatDuration(report.totalSeconds)} label={`${t.totalTime} · ${days} ${t.days}`} delta={periodDelta(report.totalSeconds, report.prevTotalSeconds)} />
        <Kpi icon={Clock} tint="bg-indigo-50 text-indigo-600" value={formatDuration(report.avgPerDaySeconds)} label={t.perDay} />
        <Kpi icon={Ban} tint="bg-red-50 text-red-600" value={String(report.web.blockedVisits)} label={t.blockedVisits} />
        <Kpi icon={BellRing} tint="bg-amber-50 text-amber-600" value={String(report.alerts.total)} label={t.alerts} />
      </div>

      <AiSummaryCard childId={childId} />

      <div className="card p-5">
        <h3 className="mb-4 text-base font-semibold">{t.dailyScreenTime}</h3>
        <div className="flex h-40 items-end gap-1.5">
          {report.trend.map((t) => (
            <div key={t.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div className="w-full rounded-t bg-brand-400 hover:bg-brand-500" style={{ height: `${Math.max((t.seconds / maxDay) * 100, 2)}%` }} title={formatDuration(t.seconds)} />
              </div>
              <span className="text-[9px] text-muted">{new Date(t.date).getDate()}</span>
            </div>
          ))}
        </div>
      </div>

      {report.byHour && report.byHour.some((n) => n > 0) && (() => {
        const max = Math.max(1, ...report.byHour!);
        const peak = report.byHour!.indexOf(max);
        return (
          <div className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">{t.byHour}</h3>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600">🔥 {t.peakAround} {peak}h</span>
            </div>
            <div className="flex h-28 items-end gap-[3px]">
              {report.byHour!.map((n, h) => (
                <div key={h} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full rounded-t bg-indigo-400 hover:bg-indigo-500" style={{ height: `${Math.max((n / max) * 100, 2)}%` }} title={`${h}h — ${n}`} />
                  </div>
                  {h % 3 === 0 && <span className="text-[9px] text-muted">{h}h</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 text-base font-semibold">{t.topApps}</h3>
          {report.topApps.length === 0 ? <p className="text-sm text-muted">{t.noData}</p> : (
            <div className="space-y-2.5">
              {report.topApps.slice(0, 8).map((a) => {
                const meta = CATEGORY_META[(a.category as Category) ?? "unknown"] ?? CATEGORY_META.unknown;
                const pct = Math.round((a.seconds / Math.max(report.topApps[0].seconds, 1)) * 100);
                return (
                  <div key={a.appName} className="flex items-center gap-3">
                    <span>{meta.emoji}</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm"><span className="font-medium">{a.appName}</span><span className="text-muted">{formatDuration(a.seconds)}</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-base font-semibold">{t.topSites}</h3>
          {report.web.topDomains.length === 0 ? <p className="text-sm text-muted">{t.noData}</p> : (
            <div className="divide-y">
              {report.web.topDomains.slice(0, 8).map((d) => (
                <div key={d.domain} className="flex items-center justify-between py-2 text-sm">
                  <span className="flex items-center gap-2"><Globe size={14} className="text-slate-400" /> {d.domain}</span>
                  <span className="text-muted">{d.count} {t.visits}{d.blocked ? ` · ${d.blocked} ${t.blockedShort}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-4 text-base font-semibold">{t.byCategory}</h3>
        {report.byCategory.length === 0 ? <p className="text-sm text-muted">{t.noData}</p> : (
          <div className="space-y-2.5">
            {report.byCategory.slice(0, 8).map((c) => {
              const meta = CATEGORY_META[(c.category as Category) ?? "unknown"] ?? CATEGORY_META.unknown;
              const pct = Math.round((c.seconds / Math.max(report.totalSeconds, 1)) * 100);
              return (
                <div key={c.category}>
                  <div className="mb-1 flex justify-between text-sm"><span>{meta.emoji} {meta.label}</span><span className="text-muted">{formatDuration(c.seconds)} · {pct}%</span></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function periodDelta(now: number, prev: number | undefined): { pct: number; up: boolean } | null {
  if (!prev || prev <= 0) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (Math.abs(pct) < 1) return null;
  return { pct: Math.abs(pct), up: now > prev };
}

function Kpi({ icon: Icon, tint, value, label, delta }: { icon: typeof Clock; tint: string; value: string; label: string; delta?: { pct: number; up: boolean } | null }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`grid h-11 w-11 place-items-center rounded-xl ${tint}`}><Icon size={20} /></div>
      <div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-muted">{label}</div>
        {delta && (
          <div className={`text-xs font-semibold ${delta.up ? "text-amber-600" : "text-emerald-600"}`}>
            {delta.up ? "▲" : "▼"} {delta.pct}%
          </div>
        )}
      </div>
    </div>
  );
}
