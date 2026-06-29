"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { Loader2, MapPin, Crosshair, Home, Navigation } from "lucide-react";

type Ping = { id: string; lat: number; lng: number; accuracy: number | null; address: string | null; ts: string };
type Fence = { id: string; name: string; lat: number; lng: number; radius: number };

export default function LocationTab() {
  const { childId } = useParams<{ childId: string }>();
  const [data, setData] = useState<{ pings: Ping[]; latest: Ping | null; geofences: Fence[] } | null>(null);
  const [locating, setLocating] = useState(false);

  async function load() {
    const res = await api.get<{ pings: Ping[]; latest: Ping | null; geofences: Fence[] }>(`/api/children/${childId}/location`);
    setData(res);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [childId]);

  async function locateNow() {
    setLocating(true);
    await api.post(`/api/children/${childId}/commands`, { type: "locate" });
    setTimeout(() => setLocating(false), 1500);
  }

  if (!data) return <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>;

  const latest = data.latest;
  const bbox = latest
    ? `${latest.lng - 0.008},${latest.lat - 0.005},${latest.lng + 0.008},${latest.lat + 0.005}`
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Position en temps réel et historique de déplacement.</p>
        <button className="btn btn-primary" onClick={locateNow} disabled={locating}>
          {locating ? <Loader2 size={16} className="spinner" /> : <Crosshair size={16} />}
          Localiser maintenant
        </button>
      </div>

      {latest && bbox ? (
        <div className="card overflow-hidden">
          <iframe
            title="map"
            className="h-80 w-full border-0"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latest.lat},${latest.lng}`}
          />
          <div className="flex items-center gap-2 p-4">
            <MapPin size={18} className="text-brand-600" />
            <div>
              <div className="text-sm font-medium">{latest.address ?? `${latest.lat.toFixed(5)}, ${latest.lng.toFixed(5)}`}</div>
              <div className="text-xs text-muted">
                {relativeTime(latest.ts)}{latest.accuracy ? ` · précision ±${Math.round(latest.accuracy)} m` : ""}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card grid place-items-center gap-2 py-16 text-center text-muted">
          <Navigation size={28} />
          <p>Aucune position. La localisation nécessite un appareil mobile avec l'app Kidora.</p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold"><Home size={18} /> Zones de sécurité</h3>
          {data.geofences.length === 0 ? (
            <p className="text-sm text-muted">Aucune zone définie.</p>
          ) : (
            <ul className="space-y-2">
              {data.geofences.map((f) => (
                <li key={f.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm">
                  <span className="font-medium">📍 {f.name}</span>
                  <span className="text-xs text-muted">rayon {f.radius} m</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-3 text-base font-semibold">Historique</h3>
          {data.pings.length === 0 ? (
            <p className="text-sm text-muted">Aucun historique.</p>
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
