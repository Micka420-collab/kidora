"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { useT } from "@/components/i18n-provider";
import { Loader2, CheckCheck, ShieldAlert, Clock, Ban, MapPin, AppWindow } from "lucide-react";

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
};

type Filter = "all" | "unread" | "critical" | "warning";

export default function AlertsPage() {
  const router = useRouter();
  const { t } = useT();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  async function load() {
    const res = await api.get<{ alerts: Alert[] }>("/api/alerts");
    setAlerts(res.alerts);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const counts = {
    all: alerts.length,
    unread: alerts.filter((a) => !a.read).length,
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
  };
  const matchesFilter = (a: Alert) =>
    filter === "all" ? true
    : filter === "unread" ? !a.read
    : a.severity === filter;
  const visible = alerts.filter(matchesFilter);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: t.alerts.filterAll },
    { key: "unread", label: t.alerts.filterUnread },
    { key: "critical", label: t.alerts.filterCritical },
    { key: "warning", label: t.alerts.filterWarning },
  ];

  async function markAll() {
    setAlerts((as) => as.map((a) => ({ ...a, read: true })));
    await api.patch("/api/alerts", { all: true });
    router.refresh();
  }
  async function markOne(id: string) {
    setAlerts((as) => as.map((a) => (a.id === id ? { ...a, read: true } : a)));
    await api.patch("/api/alerts", { ids: [id] });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.alerts.title}</h1>
          <p className="text-sm text-muted">{t.alerts.subtitle}</p>
        </div>
        <button className="btn btn-outline" onClick={markAll}><CheckCheck size={16} /> {t.alerts.markAllRead}</button>
      </div>

      {!loading && alerts.length > 0 && (
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
      ) : alerts.length === 0 ? (
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
    </div>
  );
}
