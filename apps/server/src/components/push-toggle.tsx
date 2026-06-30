"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Bell, BellOff, Loader2, Send } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushToggle() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    if (ok) {
      navigator.serviceWorker.getRegistration().then(async (reg) => {
        const sub = await reg?.pushManager.getSubscription();
        setEnabled(!!sub);
      });
    }
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Permission refusée");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await api.get<{ publicKey: string | null }>("/api/push/vapid");
      if (!publicKey) throw new Error("Notifications push non configurées sur le serveur.");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
      await api.post("/api/push/subscribe", sub.toJSON());
      setEnabled(true);
      setMsg("Notifications activées ✅");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post<{ sent: number }>("/api/push/test");
      setMsg(r.sent > 0 ? "Notification de test envoyée 📨" : "Aucun appareil abonné");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><Bell size={18} /> Notifications</h2>
      <p className="mb-4 text-sm text-muted">Recevez une notification du navigateur pour les alertes critiques.</p>

      {!supported ? (
        <div className="flex items-center gap-2 text-sm text-muted"><BellOff size={16} /> Non supporté par ce navigateur.</div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={enable} disabled={busy || enabled}>
            {busy ? <Loader2 size={16} className="spinner" /> : <Bell size={16} />}
            {enabled ? "Activées" : "Activer les notifications"}
          </button>
          {enabled && (
            <button className="btn btn-outline" onClick={test} disabled={busy}>
              <Send size={16} /> Tester
            </button>
          )}
        </div>
      )}
      {msg && <div className="mt-3 text-sm text-muted">{msg}</div>}
    </div>
  );
}
