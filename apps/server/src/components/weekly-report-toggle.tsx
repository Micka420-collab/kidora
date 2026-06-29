"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Mail, Loader2 } from "lucide-react";

export function WeeklyReportToggle({
  initial,
  label,
  desc,
}: {
  initial: boolean;
  label: string;
  desc: string;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setOn(next); // optimistic
    setBusy(true);
    setErr(null);
    try {
      const r = await api.patch<{ weeklyReportEmail: boolean }>("/api/account", {
        weeklyReportEmail: next,
      });
      setOn(r.weeklyReportEmail);
    } catch (e) {
      setOn(!next); // revert
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
            <Mail size={18} /> {label}
          </h2>
          <p className="text-sm text-muted">{desc}</p>
          {err && <p className="mt-1 text-sm text-red-600">{err}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          onClick={toggle}
          disabled={busy}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            on ? "bg-brand-600" : "bg-slate-300"
          } ${busy ? "opacity-60" : ""}`}
        >
          <span
            className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow transition-transform ${
              on ? "translate-x-6" : "translate-x-1"
            }`}
          >
            {busy && <Loader2 size={12} className="spinner text-brand-600" />}
          </span>
        </button>
      </div>
    </div>
  );
}
