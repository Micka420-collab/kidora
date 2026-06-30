"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/format";
import { useT } from "@/components/i18n-provider";
import { ErrorCard } from "@/components/error-card";
import { Loader2, AppWindow, Globe, Search, MonitorPlay, Ban } from "lucide-react";

type Event = {
  id: string;
  type: string;
  title: string | null;
  detail: string | null;
  blocked: boolean;
  ts: string;
  device: { name: string; platform: string };
};

const FILTERS = [
  { key: "", l: "all" as const },
  { key: "app_open", l: "apps" as const },
  { key: "web_visit", l: "web" as const },
  { key: "search", l: "searches" as const },
];

function iconFor(type: string) {
  if (type === "web_visit") return Globe;
  if (type === "search") return Search;
  if (type === "screen_on") return MonitorPlay;
  return AppWindow;
}

export default function ActivityTab() {
  const { childId } = useParams<{ childId: string }>();
  const { t: tr } = useT();
  const t = tr.activity;
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    api
      .get<{ events: Event[] }>(`/api/children/${childId}/activity?limit=150${filter ? `&type=${filter}` : ""}`)
      .then((r) => setEvents(r.events))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [childId, filter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${filter === f.key ? "bg-brand-600 text-white" : "bg-white border text-slate-600 hover:bg-slate-50"}`}
          >
            {t[f.l]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>
      ) : error ? (
        <ErrorCard onRetry={load} />
      ) : events.length === 0 ? (
        <div className="card p-10 text-center text-muted">{t.empty}</div>
      ) : (
        <div className="card divide-y">
          {events.map((e) => {
            const Icon = iconFor(e.type);
            return (
              <div key={e.id} className="flex items-center gap-3 p-3.5">
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${e.blocked ? "bg-red-50 text-red-500" : "bg-slate-50 text-slate-500"}`}>
                  {e.blocked ? <Ban size={16} /> : <Icon size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {e.title ?? e.type}
                    {e.blocked && <span className="badge bg-red-100 text-red-600">{t.blocked}</span>}
                  </div>
                  {e.detail && <div className="truncate text-xs text-muted">{e.detail}</div>}
                </div>
                <div className="text-right text-xs text-muted">
                  <div>{formatDate(e.ts)}</div>
                  <div>{e.device.name}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
