"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { Circle, AppWindow, MapPin, Battery, Radio } from "lucide-react";

type Live = {
  online: boolean;
  paused: boolean;
  lastSeen: string | null;
  battery: number | null;
  deviceName: string | null;
  currentApp: { title: string | null; device: string; ts: string } | null;
  location: { lat: number; lng: number; address: string | null; ts: string } | null;
};

export function LiveNow({ childId }: { childId: string }) {
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const r = await api.get<Live>(`/api/children/${childId}/live`);
        if (active) setLive(r);
      } catch {
        /* ignore transient errors */
      }
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => { active = false; clearInterval(id); };
  }, [childId]);

  if (!live) return null;

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Radio size={18} className={live.online ? "text-emerald-500" : "text-slate-400"} /> En direct
        </h3>
        <span className={`badge ${live.online ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          <Circle size={8} className={live.online ? "fill-emerald-500 text-emerald-500" : "fill-slate-400 text-slate-400"} />
          {live.online ? "En ligne" : `Vu ${relativeTime(live.lastSeen)}`}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Cell icon={<AppWindow size={16} />} label="Application" value={live.currentApp?.title ?? "—"} sub={live.currentApp ? relativeTime(live.currentApp.ts) : "aucune activité récente"} />
        <Cell icon={<MapPin size={16} />} label="Position" value={live.location?.address ?? (live.location ? `${live.location.lat.toFixed(3)}, ${live.location.lng.toFixed(3)}` : "—")} sub={live.location ? relativeTime(live.location.ts) : "non disponible"} />
        <Cell icon={<Battery size={16} />} label="Batterie" value={live.battery != null ? `${live.battery}%` : "—"} sub={live.deviceName ?? ""} />
      </div>

      {live.paused && <div className="mt-3 badge bg-amber-100 text-amber-700">⏸ Internet en pause</div>}
    </div>
  );
}

function Cell({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">{icon} {label}</div>
      <div className="mt-1 truncate font-semibold">{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}
