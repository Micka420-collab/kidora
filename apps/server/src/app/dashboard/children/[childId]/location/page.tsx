"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { useT } from "@/components/i18n-provider";
import { Loader2, MapPin, Crosshair, Home, Navigation, Plus, Trash2 } from "lucide-react";

type Ping = { id: string; lat: number; lng: number; accuracy: number | null; address: string | null; ts: string };
type Fence = { id: string; name: string; lat: number; lng: number; radius: number };

export default function LocationTab() {
  const { childId } = useParams<{ childId: string }>();
  const { t: tr } = useT();
  const t = tr.location;
  const [data, setData] = useState<{ pings: Ping[]; latest: Ping | null; geofences: Fence[] } | null>(null);
  const [locating, setLocating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", lat: "", lng: "", radius: "150" });

  const load = useCallback(async () => {
    const res = await api.get<{ pings: Ping[]; latest: Ping | null; geofences: Fence[] }>(`/api/children/${childId}/location`);
    setData(res);
  }, [childId]);
  useEffect(() => { load(); }, [load]);

  async function locateNow() {
    setLocating(true);
    await api.post(`/api/children/${childId}/commands`, { type: "locate" });
    setTimeout(() => setLocating(false), 1500);
  }

  function openAdd() {
    setForm({
      name: "",
      lat: data?.latest ? String(data.latest.lat.toFixed(5)) : "",
      lng: data?.latest ? String(data.latest.lng.toFixed(5)) : "",
      radius: "150",
    });
    setAdding(true);
  }
  async function addGeofence(e: React.FormEvent) {
    e.preventDefault();
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (!form.name || Number.isNaN(lat) || Number.isNaN(lng)) return;
    await api.post(`/api/children/${childId}/geofences`, {
      name: form.name,
      lat,
      lng,
      radius: Number(form.radius) || 150,
    });
    setAdding(false);
    load();
  }
  async function removeGeofence(id: string) {
    setData((d) => (d ? { ...d, geofences: d.geofences.filter((f) => f.id !== id) } : d));
    await api.del(`/api/children/${childId}/geofences?id=${id}`);
  }

  if (!data) return <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>;

  const latest = data.latest;
  const bbox = latest
    ? `${latest.lng - 0.008},${latest.lat - 0.005},${latest.lng + 0.008},${latest.lat + 0.005}`
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{t.intro}</p>
        <button className="btn btn-primary" onClick={locateNow} disabled={locating}>
          {locating ? <Loader2 size={16} className="spinner" /> : <Crosshair size={16} />}
          {t.locateNow}
        </button>
      </div>

      {latest && bbox ? (
        <div className="card overflow-hidden">
          <iframe
            title="Carte de localisation de l'enfant"
            loading="lazy"
            className="h-80 w-full border-0"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latest.lat},${latest.lng}`}
          />
          <div className="flex items-center gap-2 p-4">
            <MapPin size={18} className="text-brand-600" />
            <div>
              <div className="text-sm font-medium">{latest.address ?? `${latest.lat.toFixed(5)}, ${latest.lng.toFixed(5)}`}</div>
              <div className="text-xs text-muted">
                {relativeTime(latest.ts)}{latest.accuracy ? ` · ${t.accuracy} ±${Math.round(latest.accuracy)} m` : ""}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card grid place-items-center gap-2 py-16 text-center text-muted">
          <Navigation size={28} />
          <p>{t.noPosition}</p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold"><Home size={18} /> {t.zones}</h3>
            <button className="btn btn-outline py-1.5 text-sm" onClick={openAdd}><Plus size={15} /> {t.add}</button>
          </div>

          {adding && (
            <form onSubmit={addGeofence} className="mb-3 space-y-2 rounded-lg border p-3">
              <input className="input" placeholder={t.zoneName} value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} autoFocus />
              <div className="grid grid-cols-3 gap-2">
                <input className="input" placeholder="Latitude" value={form.lat} onChange={(e) => setForm((s) => ({ ...s, lat: e.target.value }))} />
                <input className="input" placeholder="Longitude" value={form.lng} onChange={(e) => setForm((s) => ({ ...s, lng: e.target.value }))} />
                <input className="input" placeholder="Rayon (m)" value={form.radius} onChange={(e) => setForm((s) => ({ ...s, radius: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary py-1.5 text-sm">{t.createZone}</button>
                <button type="button" className="btn btn-ghost py-1.5 text-sm" onClick={() => setAdding(false)}>{t.cancel}</button>
              </div>
              {data.latest && <p className="text-xs text-muted">{t.prefill}</p>}
            </form>
          )}

          {data.geofences.length === 0 ? (
            <p className="text-sm text-muted">{t.noZones}</p>
          ) : (
            <ul className="space-y-2">
              {data.geofences.map((f) => (
                <li key={f.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm">
                  <span className="font-medium">📍 {f.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted">{t.radius} {f.radius} m</span>
                    <button className="text-slate-400 hover:text-red-500" onClick={() => removeGeofence(f.id)}><Trash2 size={15} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-3 text-base font-semibold">{t.history}</h3>
          {data.pings.length === 0 ? (
            <p className="text-sm text-muted">{t.noHistory}</p>
          ) : (
            <ul className="space-y-2">
              {data.pings.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span>{p.address ?? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`}</span>
                  <span className="text-xs text-muted">{relativeTime(p.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
