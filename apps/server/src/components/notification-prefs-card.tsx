"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { MUTABLE_ALERT_TYPES } from "@/lib/alert-prefs";
import { BellRing, ShieldCheck } from "lucide-react";

type Labels = {
  title: string;
  desc: string;
  safetyNote: string;
  types: Record<string, string>;
};

export function NotificationPrefsCard({ initialMuted, labels }: { initialMuted: string[]; labels: Labels }) {
  const [muted, setMuted] = useState<string[]>(initialMuted);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(type: string) {
    const isMuted = muted.includes(type);
    const next = isMuted ? muted.filter((t) => t !== type) : [...muted, type];
    const prev = muted;
    setMuted(next); // optimistic
    setBusy(type);
    try {
      const r = await api.patch<{ mutedTypes: string[] }>("/api/account/notifications", { mutedTypes: next });
      setMuted(r.mutedTypes);
    } catch {
      setMuted(prev); // revert
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><BellRing size={18} /> {labels.title}</h2>
      <p className="mb-4 text-sm text-muted">{labels.desc}</p>

      <ul className="divide-y">
        {MUTABLE_ALERT_TYPES.map((type) => {
          const on = !muted.includes(type); // toggle shows "receive this alert"
          return (
            <li key={type} className="flex items-center justify-between gap-4 py-3">
              <span className="text-sm">{labels.types[type] ?? type}</span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={labels.types[type] ?? type}
                onClick={() => toggle(type)}
                disabled={busy === type}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${on ? "bg-brand-600" : "bg-slate-300"} ${busy === type ? "opacity-60" : ""}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-emerald-700">
        <ShieldCheck size={14} /> {labels.safetyNote}
      </p>
    </div>
  );
}
