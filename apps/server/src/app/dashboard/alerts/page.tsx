"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { csvCell, csvWithBom } from "@/lib/csv";
import { useT } from "@/components/i18n-provider";
import { ErrorCard } from "@/components/error-card";
import { Loader2, CheckCheck, ShieldAlert, Clock, Ban, MapPin, AppWindow, WifiOff, Download, Hourglass } from "lucide-react";

type Alert = {
  id: string;
  childId: string;
  type: string;
  severity: string;
  message: string;
  read: boolean;
  ts: string;
  child: { name: string; avatar: string | null };
};

const ICONS: Record<string, typeof ShieldAlert> = {
  blocked_attempt: Ban,
  limit_reached: Clock,
  bedtime: Clock,
  geofence: MapPin,
  new_app: AppWindow,
  panic: ShieldAlert,
  device_offline: WifiOff,
  time_request: Hourglass,
};

type Filter = "all" | "unread" | "critical" | "warning";

export default function AlertsPage() {
  const router = useRouter();
  const { t } = useT();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [counts, setCounts] = useState({ all: 0, unread: 0, critical: 0, warning: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // The filter is applied SERVER-side, so the chip counts and pagination reflect
  // ALL matching alerts (incl. those past the loaded page), never just what's
  // currently on screen — a paginated "Critical" view can't undercount.
  const filterQuery = (f: Filter) =>
    f === "unread" ? "?unread=1" : f === "critical" ? "?severity=critical" : f === "warning" ? "?severity=warning" : "";

  type AlertsResp = { alerts: Alert[]; nextCursor: string | null; counts: typeof counts };

  const load = useCallback(async (f: Filter) => {
    setError(false);
    try {
      const res = await api.get<AlertsResp>(`/api/alerts${filterQuery(f)}`);
      setAlerts(res.alerts);
      setNextCursor(res.nextCursor);
      setCounts(res.counts);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(filter); }, [load, filter]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = filterQuery(filter);
      const res = await api.get<AlertsResp>(`/api/alerts${q}${q ? "&" : "?"}cursor=${encodeURIComponent(nextCursor)}`);
      // De-dupe defensively in case a new alert shifted the window.
      setAlerts((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...res.alerts.filter((a) => !seen.has(a.id))];
      });
      setNextCursor(res.nextCursor);
    } catch {
      /* keep what we have; the button stays for a retry */
    } finally {
      setLoadingMore(false);
    }
  }

  const visible = alerts; // already filtered server-side

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: t.alerts.filterAll },
    { key: "unread", label: t.alerts.filterUnread },
    { key: "critical", label: t.alerts.filterCritical },
    { key: "warning", label: t.alerts.filterWarning },
  ];

  async function markAll() {
    setAlerts((as) => as.map((a) => ({ ...a, read: true })));
    setCounts((c) => ({ ...c, unread: 0 }));
    await api.patch("/api/alerts", { all: true });
    router.refresh();
  }
  async function markOne(id: string) {
    const wasUnread = alerts.some((a) => a.id === id && !a.read);
    setAlerts((as) => as.map((a) => (a.id === id ? { ...a, read: true } : a)));
    if (wasUnread) setCounts((c) => ({ ...c, unread: Math.max(0, c.unread - 1) }));
    await api.patch("/api/alerts", { ids: [id] });
    router.refresh();
  }
  function exportCsv() {
    const rows = [
      ["Date", "Enfant", "Type", "Sévérité", "Message", "Lu"],
      ...visible.map((a) => [a.ts, a.child.name, a.type, a.severity, a.message, a.read ? "oui" : "non"]),
    ];
    const csv = csvWithBom(rows.map((r) => r.map(csvCell).join(",")).join("\r\n"));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kidora-alertes.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.alerts.title}</h1>
          <p className="text-sm text-muted">{t.alerts.subtitle}</p>
        </div>
        <div className="flex gap-2">
          {alerts.length > 0 && <button className="btn btn-outline" onClick={exportCsv}><Download size={16} /> CSV</button>}
          <button className="btn btn-outline" onClick={markAll}><CheckCheck size={16} /> {t.alerts.markAllRead}</button>
        </div>
      </div>

      {!loading && counts.all > 0 && (
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const n = counts[f.key];
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={`badge border px-3 py-1.5 text-xs transition ${
                  active ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-muted hover:bg-slate-50"
                }`}
              >
                {f.label} <span className={active ? "opacity-90" : "opacity-60"}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>
      ) : error ? (
        <ErrorCard onRetry={() => { setLoading(true); load(filter); }} />
      ) : counts.all === 0 ? (
        <div className="card grid place-items-center gap-2 py-16 text-center text-muted">
          <ShieldAlert size={28} />
          <p>{t.alerts.empty}</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="card grid place-items-center gap-2 py-16 text-center text-muted">
          <ShieldAlert size={28} />
          <p>{t.alerts.noneForFilter}</p>
        </div>
      ) : (
        <div className="card divide-y">
          {visible.map((a) => {
            const Icon = ICONS[a.type] ?? ShieldAlert;
            const tint = a.severity === "critical" ? "bg-red-50 text-red-500" : a.severity === "warning" ? "bg-amber-50 text-amber-500" : "bg-brand-50 text-brand-500";
            return (
              <div key={a.id} className={`flex items-center gap-3 p-4 ${a.read ? "" : "bg-brand-50/30"}`}>
                <Link href={`/dashboard/children/${a.childId}`} className="group flex min-w-0 flex-1 items-center gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tint}`}><Icon size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium group-hover:text-brand-700">{a.message}</div>
                    <div className="text-xs text-muted">{a.child.avatar ?? "🧒"} {a.child.name} · {relativeTime(a.ts)}</div>
                  </div>
                </Link>
                {!a.read && (
                  <button className="shrink-0 text-xs font-semibold text-brand-600 hover:underline" onClick={() => markOne(a.id)}>
                    {t.alerts.markRead}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && nextCursor && (
        <div className="grid place-items-center pt-1">
          <button className="btn btn-outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 size={16} className="spinner" /> : null} {t.alerts.loadMore}
          </button>
        </div>
      )}
    </div>
  );
}
