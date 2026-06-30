"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { WEEKDAYS } from "@/lib/format";
import { useT } from "@/components/i18n-provider";
import { ErrorCard } from "@/components/error-card";
import { Loader2, Plus, Trash2, CalendarClock } from "lucide-react";

// Defensive parse of a JSON-string column — never throw during render.
function parseArr(s: string): string[] {
  try {
    const o = JSON.parse(s);
    return Array.isArray(o) ? (o as string[]) : [];
  } catch {
    return [];
  }
}

type Routine = {
  id: string;
  name: string;
  enabled: boolean;
  days: string;
  start: string;
  end: string;
  blockedAppIds: string;
};
type AppRule = { appId: string; appName: string };

const empty = { name: "", days: ["mon", "tue", "wed", "thu", "fri"], start: "08:00", end: "16:00", apps: [] as string[] };

export function RoutinesCard({ childId }: { childId: string }) {
  const { t: tr } = useT();
  const t = tr.screen;
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [apps, setApps] = useState<AppRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(empty);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [r, a] = await Promise.all([
        api.get<{ routines: Routine[] }>(`/api/children/${childId}/routines`),
        api.get<{ rules: AppRule[] }>(`/api/children/${childId}/rules/apps`),
      ]);
      setRoutines(r.routines);
      setApps(a.rules);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [childId]);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    try {
      await api.post(`/api/children/${childId}/routines`, {
        name: form.name, days: form.days, start: form.start, end: form.end, blockedAppIds: form.apps,
      });
      setForm(empty);
      setAdding(false);
    } finally {
      load();
    }
  }
  async function toggle(r: Routine) {
    try {
      await api.post(`/api/children/${childId}/routines`, {
        id: r.id, name: r.name, enabled: !r.enabled,
        days: parseArr(r.days), start: r.start, end: r.end, blockedAppIds: parseArr(r.blockedAppIds),
      });
    } finally {
      load();
    }
  }
  async function remove(id: string) {
    const prev = routines;
    setRoutines((rs) => rs.filter((x) => x.id !== id)); // optimistic
    try {
      await api.del(`/api/children/${childId}/routines?id=${id}`);
    } catch {
      setRoutines(prev); // rollback
    }
  }
  function toggleApp(appId: string) {
    setForm((f) => ({ ...f, apps: f.apps.includes(appId) ? f.apps.filter((a) => a !== appId) : [...f.apps, appId] }));
  }
  function toggleDay(key: string) {
    setForm((f) => ({ ...f, days: f.days.includes(key) ? f.days.filter((d) => d !== key) : [...f.days, key] }));
  }

  if (loading) return <div className="card grid place-items-center p-8"><Loader2 className="spinner text-muted" /></div>;
  if (error) return <ErrorCard onRetry={() => { setLoading(true); load(); }} />;

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold"><CalendarClock size={18} /> {t.routines}</h3>
        <button className="btn btn-outline py-1.5 text-sm" onClick={() => setAdding((v) => !v)}><Plus size={15} /> {t.add}</button>
      </div>
      <p className="mb-4 text-sm text-muted">{t.routinesDesc}</p>

      {adding && (
        <form onSubmit={save} className="mb-4 space-y-3 rounded-lg border p-3">
          <input className="input" placeholder={t.routineName} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
          <div className="flex items-center gap-2">
            <input type="time" className="input w-auto py-1.5 text-sm" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
            <span className="text-muted">→</span>
            <input type="time" className="input w-auto py-1.5 text-sm" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => (
              <button type="button" key={d.key} onClick={() => toggleDay(d.key)} className={`h-8 w-10 rounded-md text-xs font-semibold ${form.days.includes(d.key) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}>{d.label}</button>
            ))}
          </div>
          <div>
            <div className="label">{t.blockedApps}</div>
            {apps.length === 0 ? (
              <p className="text-xs text-muted">{t.noApps}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {apps.map((a) => (
                  <button type="button" key={a.appId} onClick={() => toggleApp(a.appId)} className={`badge ${form.apps.includes(a.appId) ? "bg-red-500 text-white" : "bg-slate-100 text-slate-600"}`}>{a.appName}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary py-1.5 text-sm">{t.createRoutine}</button>
            <button type="button" className="btn btn-ghost py-1.5 text-sm" onClick={() => setAdding(false)}>{t.cancel}</button>
          </div>
        </form>
      )}

      {routines.length === 0 ? (
        <p className="text-sm text-muted">{t.noRoutines}</p>
      ) : (
        <div className="space-y-2">
          {routines.map((r) => {
            const days = parseArr(r.days);
            const appCount = parseArr(r.blockedAppIds).length;
            return (
              <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium">{r.name} <span className="text-xs font-normal text-muted">· {r.start}–{r.end}</span></div>
                  <div className="text-xs text-muted">{days.map((d) => WEEKDAYS.find((w) => w.key === d)?.label).join(" ")} · {appCount} app(s) bloquée(s)</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => toggle(r)} className={`relative h-5 w-9 rounded-full transition ${r.enabled ? "bg-brand-600" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${r.enabled ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                  <button className="text-slate-400 hover:text-red-500" onClick={() => remove(r.id)}><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
