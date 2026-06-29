"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { Loader2, Monitor, Smartphone, Plus, Copy, Check, Circle, Lock, MessageSquare, Send } from "lucide-react";

type Device = {
  id: string;
  name: string;
  platform: string;
  model: string | null;
  enrollToken: string;
  enrolled: boolean;
  online: boolean;
  battery: number | null;
  lastSeen: string | null;
  agentVersion: string | null;
};

export default function DevicesTab() {
  const { childId } = useParams<{ childId: string }>();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", platform: "windows" });
  const [justAdded, setJustAdded] = useState<Device | null>(null);
  const [copied, setCopied] = useState(false);
  const [msgFor, setMsgFor] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [sentFor, setSentFor] = useState<string | null>(null);

  async function load() {
    const res = await api.get<{ devices: Device[] }>(`/api/children/${childId}/devices`);
    setDevices(res.devices);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [childId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    const res = await api.post<{ device: Device }>(`/api/children/${childId}/devices`, form);
    setJustAdded(res.device);
    setAdding(false);
    setForm({ name: "", platform: "windows" });
    load();
  }

  function copyToken(t: string) {
    navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function sendCommand(deviceId: string, type: string, payload?: object) {
    await api.post(`/api/children/${childId}/commands`, { type, deviceId, payload });
    setSentFor(deviceId + type);
    setTimeout(() => setSentFor(null), 1800);
  }
  async function sendMessage(deviceId: string) {
    if (!msgText.trim()) return;
    await sendCommand(deviceId, "message", { text: msgText.trim() });
    setMsgText("");
    setMsgFor(null);
  }

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Appareils surveillés par Kidora.</p>
        <button className="btn btn-outline" onClick={() => setAdding((v) => !v)}><Plus size={16} /> Ajouter un appareil</button>
      </div>

      {adding && (
        <form onSubmit={add} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1">
            <label className="label">Nom de l'appareil</label>
            <input className="input" placeholder="PC de la chambre" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="label">Plateforme</label>
            <select className="input" value={form.platform} onChange={(e) => setForm((s) => ({ ...s, platform: e.target.value }))}>
              <option value="windows">Windows</option>
              <option value="android">Android</option>
              <option value="ios">iPhone / iPad</option>
              <option value="macos">macOS</option>
            </select>
          </div>
          <button className="btn btn-primary">Créer</button>
        </form>
      )}

      {justAdded && (
        <div className="card border-brand-200 bg-brand-50 p-5">
          <h3 className="font-semibold">🔗 Connectez « {justAdded.name} »</h3>
          <p className="mt-1 text-sm text-muted">
            Installez l'agent Kidora sur l'appareil et saisissez ce jeton d'enrôlement :
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border bg-white px-3 py-2 text-sm">{justAdded.enrollToken}</code>
            <button className="btn btn-outline" onClick={() => copyToken(justAdded.enrollToken)}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          {justAdded.platform === "windows" && (
            <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{`# Sur le PC enfant (PowerShell) :
cd kidora-agent
node agent.js --token ${justAdded.enrollToken} --server ${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}`}
            </pre>
          )}
          <button className="mt-3 text-sm font-semibold text-brand-600" onClick={() => setJustAdded(null)}>J'ai terminé</button>
        </div>
      )}

      {devices.length === 0 ? (
        <div className="card p-10 text-center text-muted">Aucun appareil. Ajoutez-en un pour commencer la surveillance.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {devices.map((d) => (
            <div key={d.id} className="card p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-50 text-slate-500">
                  {d.platform === "windows" || d.platform === "macos" ? <Monitor size={20} /> : <Smartphone size={20} />}
                </span>
                <div className="flex-1">
                  <div className="font-semibold">{d.name}</div>
                  <div className="text-xs capitalize text-muted">{d.platform}{d.model ? ` · ${d.model}` : ""}</div>
                </div>
                <Circle size={9} className={d.online ? "fill-emerald-500 text-emerald-500" : "fill-slate-300 text-slate-300"} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <Stat label="Statut" value={d.enrolled ? (d.online ? "En ligne" : "Hors ligne") : "En attente"} />
                <Stat label="Batterie" value={d.battery != null ? `${d.battery}%` : "—"} />
                <Stat label="Vu" value={relativeTime(d.lastSeen)} />
              </div>
              {!d.enrolled && (
                <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                  En attente de connexion · Jeton : <code>{d.enrollToken.slice(0, 12)}…</code>
                </div>
              )}

              {d.enrolled && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <button className="btn btn-outline flex-1 py-1.5 text-sm" onClick={() => sendCommand(d.id, "lock")}>
                      {sentFor === d.id + "lock" ? <Check size={15} /> : <Lock size={15} />} Verrouiller
                    </button>
                    <button className="btn btn-outline flex-1 py-1.5 text-sm" onClick={() => { setMsgFor(msgFor === d.id ? null : d.id); setMsgText(""); }}>
                      <MessageSquare size={15} /> Message
                    </button>
                  </div>
                  {msgFor === d.id && (
                    <div className="flex gap-2">
                      <input className="input py-1.5 text-sm" placeholder="Votre message…" value={msgText} onChange={(e) => setMsgText(e.target.value)} autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") sendMessage(d.id); }} />
                      <button className="btn btn-primary py-1.5 text-sm" onClick={() => sendMessage(d.id)}>
                        {sentFor === d.id + "message" ? <Check size={15} /> : <Send size={15} />}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 py-2">
      <div className="font-semibold">{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}
