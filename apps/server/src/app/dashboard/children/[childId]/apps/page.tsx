"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { CATEGORY_META, type Category } from "@/lib/categories";
import { formatMinutes } from "@/lib/format";
import { useT } from "@/components/i18n-provider";
import { useToast } from "@/components/toast";
import { ErrorCard } from "@/components/error-card";
import { Loader2, Plus, Trash2, Check, Ban, Hourglass } from "lucide-react";

type Rule = {
  id: string;
  appId: string;
  appName: string;
  category: string | null;
  action: "allow" | "block" | "limit";
  dailyLimitMinutes: number | null;
};

export default function AppsTab() {
  const { childId } = useParams<{ childId: string }>();
  const { t } = useT();
  const toast = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [usageToday, setUsageToday] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newApp, setNewApp] = useState({ appName: "", appId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<{ rules: Rule[]; usageToday?: Record<string, number> }>(`/api/children/${childId}/rules/apps`);
      setRules(res.rules);
      setUsageToday(res.usageToday ?? {});
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [childId]);
  useEffect(() => { load(); }, [load]);

  // Optimistic update + rollback: if the save fails, restore the prior state and
  // tell the parent, so a rule never LOOKS applied while the server rejected it.
  async function setAction(r: Rule, action: Rule["action"]) {
    const prev = rules;
    setRules((rs) => rs.map((x) => (x.appId === r.appId ? { ...x, action } : x)));
    try {
      await api.put(`/api/children/${childId}/rules/apps`, {
        appId: r.appId, appName: r.appName, action,
        dailyLimitMinutes: action === "limit" ? r.dailyLimitMinutes ?? 60 : null,
      });
    } catch {
      setRules(prev);
      toast(t.common.error, "error");
    }
  }
  async function setLimit(r: Rule, minutes: number) {
    const prev = rules;
    setRules((rs) => rs.map((x) => (x.appId === r.appId ? { ...x, dailyLimitMinutes: minutes } : x)));
    try {
      await api.put(`/api/children/${childId}/rules/apps`, {
        appId: r.appId, appName: r.appName, action: "limit", dailyLimitMinutes: minutes,
      });
    } catch {
      setRules(prev);
      toast(t.common.error, "error");
    }
  }
  async function remove(r: Rule) {
    const prev = rules;
    setRules((rs) => rs.filter((x) => x.appId !== r.appId));
    try {
      await api.del(`/api/children/${childId}/rules/apps?appId=${encodeURIComponent(r.appId)}`);
    } catch {
      setRules(prev);
      toast(t.common.error, "error");
    }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newApp.appName) return;
    const appId = newApp.appId || newApp.appName.toLowerCase().replace(/\s+/g, "") + ".exe";
    try {
      await api.put(`/api/children/${childId}/rules/apps`, {
        appId, appName: newApp.appName, action: "allow", dailyLimitMinutes: null,
      });
      setNewApp({ appName: "", appId: "" });
      setAdding(false);
      load();
    } catch {
      toast(t.common.error, "error"); // keep the form so the parent can retry
    }
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorCard onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{t.apps.intro}</p>
        <button className="btn btn-outline" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} /> {t.apps.add}
        </button>
      </div>

      {adding && (
        <form onSubmit={add} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1">
            <label className="label">{t.apps.appName}</label>
            <input className="input" placeholder="Ex : Fortnite" value={newApp.appName} onChange={(e) => setNewApp((s) => ({ ...s, appName: e.target.value }))} autoFocus />
          </div>
          <div className="flex-1">
            <label className="label">{t.apps.appId}</label>
            <input className="input" placeholder="fortnite.exe" value={newApp.appId} onChange={(e) => setNewApp((s) => ({ ...s, appId: e.target.value }))} />
          </div>
          <button className="btn btn-primary">{t.apps.add}</button>
        </form>
      )}

      {rules.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          {t.apps.empty}
        </div>
      ) : (
        <div className="card divide-y">
          {rules.map((r) => {
            const meta = CATEGORY_META[(r.category as Category) ?? "unknown"] ?? CATEGORY_META.unknown;
            return (
              <div key={r.appId} className="flex flex-wrap items-center gap-3 p-4">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-50 text-xl">{meta.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.appName}</div>
                  <div className="text-xs text-muted">{meta.label} · {r.appId}</div>
                  {r.action === "limit" && r.dailyLimitMinutes != null && (() => {
                    const usedMin = Math.round((usageToday[r.appId] ?? 0) / 60);
                    const limit = Math.max(r.dailyLimitMinutes, 1);
                    const pct = Math.min(100, Math.round((usedMin / limit) * 100));
                    const over = usedMin >= r.dailyLimitMinutes;
                    return (
                      <div className="mt-1.5 max-w-[14rem]">
                        <div className="text-xs text-muted">{formatMinutes(usedMin)} / {formatMinutes(r.dailyLimitMinutes)} {t.apps.usedToday}</div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {r.action === "limit" && (
                  <select
                    className="input w-auto py-1.5 text-sm"
                    value={r.dailyLimitMinutes ?? 60}
                    onChange={(e) => setLimit(r, Number(e.target.value))}
                  >
                    {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => (
                      <option key={m} value={m}>{formatMinutes(m)}{t.apps.perDay}</option>
                    ))}
                  </select>
                )}

                <div className="flex overflow-hidden rounded-lg border">
                  <Seg active={r.action === "allow"} color="emerald" onClick={() => setAction(r, "allow")}><Check size={14} /> {t.apps.allow}</Seg>
                  <Seg active={r.action === "limit"} color="amber" onClick={() => setAction(r, "limit")}><Hourglass size={14} /> {t.apps.limit}</Seg>
                  <Seg active={r.action === "block"} color="red" onClick={() => setAction(r, "block")}><Ban size={14} /> {t.apps.block}</Seg>
                </div>

                <button className="text-slate-400 hover:text-red-500" onClick={() => remove(r)} aria-label={`Supprimer ${r.appName}`}><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Seg({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  const tints: Record<string, string> = {
    emerald: "bg-emerald-500 text-white",
    amber: "bg-amber-500 text-white",
    red: "bg-red-500 text-white",
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold transition ${active ? tints[color] : "bg-white text-slate-500 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <div className="grid place-items-center py-16 text-muted">
      <Loader2 className="spinner" />
    </div>
  );
}
