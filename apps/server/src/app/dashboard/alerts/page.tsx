"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { Loader2, CheckCheck, ShieldAlert, Clock, Ban, MapPin, AppWindow } from "lucide-react";

type Alert = {
  id: string;
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

export default function AlertsPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await api.get<{ alerts: Alert[] }>("/api/alerts");
    setAlerts(res.alerts);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

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
          <h1 className="text-2xl font-bold">Alertes</h1>
          <p className="text-sm text-muted">Événements importants détectés sur les appareils de vos enfants.</p>
        </div>
        <button className="btn btn-outline" onClick={markAll}><CheckCheck size={16} /> Tout marquer comme lu</button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>
      ) : alerts.length === 0 ? (
        <div className="card grid place-items-center gap-2 py-16 text-center text-muted">
          <ShieldAlert size={28} />
          <p>Aucune alerte. Tout va bien ! ✅</p>
        </div>
      ) : (
        <div className="card divide-y">
          {alerts.map((a) => {
            const Icon = ICONS[a.type] ?? ShieldAlert;
            const tint = a.severity === "critical" ? "bg-red-50 text-red-500" : a.severity === "warning" ? "bg-amber-50 text-amber-500" : "bg-brand-50 text-brand-500";
            return (
              <div key={a.id} className={`flex items-center gap-3 p-4 ${a.read ? "" : "bg-brand-50/30"}`}>
                <span className={`grid h-10 w-10 place-items-center rounded-lg ${tint}`}><Icon size={18} /></span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{a.message}</div>
                  <div className="text-xs text-muted">{a.child.avatar ?? "🧒"} {a.child.name} · {relativeTime(a.ts)}</div>
                </div>
                {!a.read && (
                  <button className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => markOne(a.id)}>
                    Marquer lu
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
