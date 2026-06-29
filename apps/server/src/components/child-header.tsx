"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Pause, Play, Smartphone, Monitor, Loader2, Battery } from "lucide-react";

type Device = {
  id: string;
  name: string;
  platform: string;
  online: boolean;
  battery: number | null;
};

export function ChildHeader({
  child,
  devices,
}: {
  child: { id: string; name: string; avatar: string | null; paused: boolean };
  devices: Device[];
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(child.paused);
  const [loading, setLoading] = useState(false);

  async function togglePause() {
    setLoading(true);
    try {
      const res = await api.post<{ paused: boolean }>(
        `/api/children/${child.id}/pause`,
        { paused: !paused },
      );
      setPaused(res.paused);
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
              {paused && <span className="badge bg-amber-100 text-amber-700">⏸ En pause</span>}
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

        <button
          onClick={togglePause}
          disabled={loading}
          className={`btn ${paused ? "btn-primary" : "btn-danger"}`}
        >
          {loading ? <Loader2 size={16} className="spinner" /> : paused ? <Play size={16} /> : <Pause size={16} />}
          {paused ? "Reprendre" : "Pause Internet"}
        </button>
      </div>
    </div>
  );
}
