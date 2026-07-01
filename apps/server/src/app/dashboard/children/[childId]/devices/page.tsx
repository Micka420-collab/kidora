"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { api } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { useT } from "@/components/i18n-provider";
import { ErrorCard } from "@/components/error-card";
import { Loader2, Monitor, Smartphone, Plus, Copy, Check, Circle, Lock, MessageSquare, Send, Camera, Pencil, Trash2, X } from "lucide-react";

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
  const { t: tr } = useT();
  const t = tr.devices;
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", platform: "windows" });
  const [justAdded, setJustAdded] = useState<Device | null>(null);
  const [copied, setCopied] = useState(false);
  const [msgFor, setMsgFor] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [sentFor, setSentFor] = useState<string | null>(null);
  const [shots, setShots] = useState<{ id: string; dataUrl: string; createdAt: string }[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!justAdded || (justAdded.platform !== "android" && justAdded.platform !== "ios")) {
      setQrUrl(null);
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const payload = `kidorachild://enroll?token=${encodeURIComponent(justAdded.enrollToken)}&server=${encodeURIComponent(origin)}`;
    QRCode.toDataURL(payload, { width: 200, margin: 1 }).then(setQrUrl).catch(() => setQrUrl(null));
  }, [justAdded]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    // Screenshots are best-effort and shouldn't gate the devices list.
    api.get<{ screenshots: { id: string; dataUrl: string; createdAt: string }[] }>(`/api/children/${childId}/screenshots`)
      .then((r) => setShots(r.screenshots)).catch(() => {});
    try {
      const res = await api.get<{ devices: Device[] }>(`/api/children/${childId}/devices`);
      setDevices(res.devices);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [childId]);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || creating) return; // guard double-submit → no duplicate device
    setCreating(true);
    try {
      const res = await api.post<{ device: Device }>(`/api/children/${childId}/devices`, form);
      setJustAdded(res.device);
      setAdding(false);
      setForm({ name: "", platform: "windows" });
      load();
    } finally {
      setCreating(false);
    }
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

  async function renameDevice(id: string) {
    const name = editName.trim();
    if (!name) return;
    setDevices((ds) => ds.map((d) => (d.id === id ? { ...d, name } : d)));
    setEditId(null);
    await api.patch(`/api/children/${childId}/devices/${id}`, { name });
  }
  async function removeDevice(id: string, name: string) {
    if (!confirm(`Retirer l'appareil « ${name} » ? La surveillance s'arrêtera pour cet appareil.`)) return;
    setDevices((ds) => ds.filter((d) => d.id !== id));
    await api.del(`/api/children/${childId}/devices/${id}`);
  }

  if (error) return <ErrorCard onRetry={load} />;
  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>;

  // Server URL for the enrollment snippets (the justAdded block is only shown
  // after a client action, so window is always defined by then).
  const winServer = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{t.intro}</p>
        <button className="btn btn-outline" onClick={() => setAdding((v) => !v)}><Plus size={16} /> {t.add}</button>
      </div>

      {adding && (
        <form onSubmit={add} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1">
            <label className="label">{t.name}</label>
            <input className="input" placeholder="PC de la chambre" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="label">{t.platform}</label>
            <select className="input" value={form.platform} onChange={(e) => setForm((s) => ({ ...s, platform: e.target.value }))}>
              <option value="windows">Windows</option>
              <option value="android">Android</option>
              <option value="ios">iPhone / iPad</option>
              <option value="macos">macOS</option>
            </select>
          </div>
          <button className="btn btn-primary" disabled={creating}>
            {creating ? <Loader2 size={16} className="spinner" /> : null} {t.create}
          </button>
        </form>
      )}

      {justAdded && (
        <div className="card border-brand-200 bg-brand-50 p-5">
          <h3 className="font-semibold">🔗 {t.connect} « {justAdded.name} »</h3>

          {qrUrl && (
            <div className="mt-3 flex items-center gap-4 rounded-lg border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="QR d'appairage" className="h-40 w-40" />
              <div className="text-sm text-muted">
                <p className="font-medium text-ink">{t.quickPair}</p>
                <p className="mt-1">{t.quickPairDesc}</p>
              </div>
            </div>
          )}

          <p className="mt-3 text-sm text-muted">{t.orToken}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border bg-white px-3 py-2 text-sm">{justAdded.enrollToken}</code>
            <button className="btn btn-outline" onClick={() => copyToken(justAdded.enrollToken)}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          {justAdded.platform === "windows" && (
            <>
              <a
                href="https://github.com/Micka420-collab/kidora/releases"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
              >
                {t.getAgent}
              </a>
              <p className="mt-3 text-sm text-muted">{t.winInstall}</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{`msiexec /i kidora-agent.msi /qn TOKEN=${justAdded.enrollToken} SERVER=${winServer} CHILDUSER="PC\\Enfant"`}
              </pre>
              <p className="mt-3 text-sm text-muted">{t.winSourceNote}</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{`cd kidora-agent
node agent.js --token ${justAdded.enrollToken} --server ${winServer}`}
              </pre>
            </>
          )}
          <button className="mt-3 text-sm font-semibold text-brand-600" onClick={() => setJustAdded(null)}>{t.done}</button>
        </div>
      )}

      {devices.length === 0 ? (
        <div className="card p-10 text-center text-muted">{t.empty}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {devices.map((d) => (
            <div key={d.id} className="card p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-50 text-slate-500">
                  {d.platform === "windows" || d.platform === "macos" ? <Monitor size={20} /> : <Smartphone size={20} />}
                </span>
                <div className="min-w-0 flex-1">
                  {editId === d.id ? (
                    <div className="flex items-center gap-1">
                      <input className="input py-1 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") renameDevice(d.id); if (e.key === "Escape") setEditId(null); }} />
                      <button className="text-emerald-600" onClick={() => renameDevice(d.id)}><Check size={16} /></button>
                      <button className="text-slate-400" onClick={() => setEditId(null)}><X size={16} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{d.name}</span>
                      <button className="text-slate-300 hover:text-brand-500" onClick={() => { setEditId(d.id); setEditName(d.name); }}><Pencil size={13} /></button>
                    </div>
                  )}
                  <div className="text-xs capitalize text-muted">{d.platform}{d.model ? ` · ${d.model}` : ""}</div>
                </div>
                <Circle size={9} className={d.online ? "fill-emerald-500 text-emerald-500" : "fill-slate-300 text-slate-300"} />
                <button className="text-slate-300 hover:text-red-500" title={tr.common.delete} onClick={() => removeDevice(d.id, d.name)}><Trash2 size={15} /></button>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <Stat label={t.statusLabel} value={d.enrolled ? (d.online ? t.online : t.offline) : t.pending} />
                <Stat label={t.batteryLabel} value={d.battery != null ? `${d.battery}%` : "—"} />
                <Stat label={t.seenLabel} value={relativeTime(d.lastSeen)} />
              </div>
              {!d.enrolled && (
                <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                  {t.waiting} <code>{d.enrollToken.slice(0, 12)}…</code>
                </div>
              )}

              {d.enrolled && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <button className="btn btn-outline flex-1 py-1.5 text-sm" onClick={() => sendCommand(d.id, "lock")}>
                      {sentFor === d.id + "lock" ? <Check size={15} /> : <Lock size={15} />} {t.lock}
                    </button>
                    <button className="btn btn-outline flex-1 py-1.5 text-sm" onClick={() => { setMsgFor(msgFor === d.id ? null : d.id); setMsgText(""); }}>
                      <MessageSquare size={15} /> {t.message}
                    </button>
                    {(d.platform === "windows" || d.platform === "macos") && (
                      <button className="btn btn-outline py-1.5 text-sm" title="Capture d'écran" onClick={() => sendCommand(d.id, "screenshot")}>
                        {sentFor === d.id + "screenshot" ? <Check size={15} /> : <Camera size={15} />}
                      </button>
                    )}
                  </div>
                  {msgFor === d.id && (
                    <div className="flex gap-2">
                      <input className="input py-1.5 text-sm" placeholder={t.msgPlaceholder} value={msgText} onChange={(e) => setMsgText(e.target.value)} autoFocus
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

      {shots.length > 0 && (
        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold"><Camera size={18} /> {t.screenshots}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shots.map((sc) => (
              <a key={sc.id} href={sc.dataUrl} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sc.dataUrl} alt="capture" className="h-28 w-full object-cover transition group-hover:opacity-90" />
                <div className="px-2 py-1 text-[10px] text-muted">{relativeTime(sc.createdAt)}</div>
              </a>
            ))}
          </div>
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
