"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Pause, Play, Smartphone, Monitor, Loader2, Battery, Clock } from "lucide-react";

type Device = {
  id: string;
  name: string;
  platform: string;
  online: boolean;
  battery: number | null;
};

// Defined at module scope so the Date call stays out of the component render.
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const PRESETS = [
  { label: "30 min", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
];

export function ChildHeader({
  child,
  devices,
}: {
  child: { id: string; name: string; avatar: string | null; paused: boolean; pausedUntil: string | null };
  devices: Device[];
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(child.paused);
  const [until, setUntil] = useState(child.pausedUntil);
  const [loading, setLoading] = useState(false);

  async function act(body: { paused?: boolean; untilMinutes?: number }) {
    setLoading(true);
    try {
      const res = await api.post<{ paused: boolean; pausedUntil: string | null }>(`/api/children/${child.id}/pause`, body);
      setPaused(res.paused || !!res.pausedUntil);
      setUntil(res.pausedUntil);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-3xl">
            {child.avatar ?? "🧒"}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{child.name}</h1>
              {paused && (
                <span className="badge bg-amber-100 text-amber-700">
                  ⏸ En pause{until ? ` · jusqu'à ${formatTime(until)}` : ""}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {devices.length === 0 && <span className="text-sm text-muted">Aucun appareil</span>}
              {devices.map((d) => (
                <span key={d.id} className="badge bg-slate-100 text-slate-600">
                  {d.platform === "windows" || d.platform === "macos" ? <Monitor size={12} /> : <Smartphone size={12} />}
                  {d.name}
                  <span className={`h-1.5 w-1.5 rounded-full ${d.online ? "bg-emerald-500" : "bg-slate-300"}`} />
                  {d.battery != null && (
                    <span className="flex items-center gap-0.5 text-slate-400"><Battery size={11} />{d.battery}%</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>

        {paused ? (
          <button onClick={() => act({ paused: false })} disabled={loading} className="btn btn-primary">
            {loading ? <Loader2 size={16} className="spinner" /> : <Play size={16} />}
            Reprendre
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.minutes}
                onClick={() => act({ untilMinutes: p.minutes })}
                disabled={loading}
                title={`Pause ${p.label}`}
                className="btn btn-ghost border"
              >
                <Clock size={14} /> {p.label}
              </button>
            ))}
            <button onClick={() => act({ paused: true })} disabled={loading} className="btn btn-danger">
              {loading ? <Loader2 size={16} className="spinner" /> : <Pause size={16} />}
              Pause Internet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
