"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { WEEKDAYS, formatMinutes } from "@/lib/format";
import { useT } from "@/components/i18n-provider";
import { useToast } from "@/components/toast";
import { ErrorCard } from "@/components/error-card";
import { Loader2, Moon, Plus, Trash2, Save, Check } from "lucide-react";
import { RoutinesCard } from "@/components/routines-card";

type Bedtime = { days: string[]; start: string; end: string };
type ST = { enabled: boolean; dailyLimits: Record<string, number>; bedtimes: Bedtime[] };

export default function ScreenTimeTab() {
  const { childId } = useParams<{ childId: string }>();
  const { t: tr } = useT();
  const t = tr.screen;
  const toast = useToast();
  const [st, setSt] = useState<ST | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<{ screenTime: { enabled: boolean; dailyLimits: string; bedtimes: string } | null }>(`/api/children/${childId}/screentime`);
      const s = res.screenTime;
      setSt({
        enabled: s?.enabled ?? true,
        dailyLimits: s ? JSON.parse(s.dailyLimits) : {},
        bedtimes: s ? JSON.parse(s.bedtimes) : [],
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [childId]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!st) return;
    setSaving(true);
    try {
      // A bedtime with no day checked would be read by the engine as EVERY day
      // — drop them on save instead (the mobile app does the same).
      await api.put(`/api/children/${childId}/screentime`, { ...st, bedtimes: st.bedtimes.filter((b) => b.days.length > 0) });
      setSaved(true);
      toast(t.saved, "success");
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast(tr.common.error, "error");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorCard onRetry={load} />;
  if (loading || !st) return <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>;

  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between p-5">
        <div>
          <div className="font-semibold">{t.limits}</div>
          <div className="text-sm text-muted">{t.limitsDesc}</div>
        </div>
        <button
          onClick={() => setSt({ ...st, enabled: !st.enabled })}
          role="switch"
          aria-checked={st.enabled}
          aria-label={t.limits}
          className={`relative h-6 w-11 rounded-full transition ${st.enabled ? "bg-brand-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${st.enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      <div className={`card p-5 ${st.enabled ? "" : "pointer-events-none opacity-50"}`}>
        <h3 className="mb-4 text-base font-semibold">{t.dailyLimit}</h3>
        <div className="grid grid-cols-7 gap-2">
          {WEEKDAYS.map((d) => (
            <div key={d.key} className="text-center">
              <div className="mb-1 text-xs font-semibold text-muted">{d.label}</div>
              <input
                type="number"
                min={0}
                max={1440}
                step={15}
                className="input px-1 py-1.5 text-center text-sm"
                value={st.dailyLimits[d.key] ?? 0}
                onChange={(e) =>
                  setSt({ ...st, dailyLimits: { ...st.dailyLimits, [d.key]: Number(e.target.value) } })
                }
              />
              <div className="mt-1 text-[10px] text-muted">
                {(st.dailyLimits[d.key] ?? 0) > 0 ? formatMinutes(st.dailyLimits[d.key] ?? 0) : t.unlimited}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{t.zeroHint}</p>
        <div className="mt-3 flex gap-2">
          {[60, 90, 120, 180].map((m) => (
            <button
              key={m}
              className="btn btn-outline py-1 text-xs"
              onClick={() => setSt({ ...st, dailyLimits: Object.fromEntries(WEEKDAYS.map((d) => [d.key, m])) })}
            >
              {t.allTo} {formatMinutes(m)}
            </button>
          ))}
        </div>
      </div>

      <div className={`card p-5 ${st.enabled ? "" : "pointer-events-none opacity-50"}`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold"><Moon size={18} /> {t.bedtime}</h3>
          <button
            className="btn btn-outline py-1.5 text-sm"
            onClick={() => setSt({ ...st, bedtimes: [...st.bedtimes, { days: ["mon", "tue", "wed", "thu", "sun"], start: "21:00", end: "07:00" }] })}
          >
            <Plus size={15} /> {t.add}
          </button>
        </div>
        {st.bedtimes.length === 0 ? (
          <p className="text-sm text-muted">{t.noBedtime}</p>
        ) : (
          <div className="space-y-3">
            {st.bedtimes.map((b, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input type="time" className="input w-auto py-1.5 text-sm" value={b.start} onChange={(e) => updateBed(i, { start: e.target.value })} />
                  <span className="text-muted">→</span>
                  <input type="time" className="input w-auto py-1.5 text-sm" value={b.end} onChange={(e) => updateBed(i, { end: e.target.value })} />
                  <button className="ml-auto text-slate-400 hover:text-red-500" onClick={() => setSt({ ...st, bedtimes: st.bedtimes.filter((_, j) => j !== i) })} aria-label="Supprimer cette plage de coucher">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => {
                    const on = b.days.includes(d.key);
                    return (
                      <button
                        key={d.key}
                        onClick={() => updateBed(i, { days: on ? b.days.filter((x) => x !== d.key) : [...b.days, d.key] })}
                        className={`h-8 w-10 rounded-md text-xs font-semibold transition ${on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                {b.days.length === 0 && (
                  <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">{t.noDaysBedtime}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={save} className="btn btn-primary" disabled={saving}>
        {saving ? <Loader2 size={16} className="spinner" /> : saved ? <Check size={16} /> : <Save size={16} />}
        {saved ? t.saved : t.save}
      </button>

      <RoutinesCard childId={childId} />
    </div>
  );

  function updateBed(i: number, patch: Partial<Bedtime>) {
    setSt((s) => (s ? { ...s, bedtimes: s.bedtimes.map((b, j) => (j === i ? { ...b, ...patch } : b)) } : s));
  }
}
