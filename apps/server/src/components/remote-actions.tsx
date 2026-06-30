"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";
import { Lock, MapPin, Camera, Send, Loader2 } from "lucide-react";

export function RemoteActions({ childId }: { childId: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function send(type: string, payload: object | undefined, okMsg: string) {
    setBusy(type);
    try {
      await api.post(`/api/children/${childId}/commands`, { type, payload });
      toast(okMsg, "success");
    } catch {
      toast("Action impossible", "error");
    } finally {
      setBusy(null);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = msg.trim();
    if (!text) return;
    await send("message", { text }, "Message envoyé");
    setMsg("");
  }

  return (
    <div className="card p-4">
      <div className="mb-3 text-sm font-semibold">Actions à distance</div>
      <div className="flex flex-wrap gap-2">
        <Btn icon={Lock} label="Verrouiller" busy={busy === "lock"} onClick={() => send("lock", undefined, "Appareil verrouillé")} />
        <Btn icon={MapPin} label="Localiser" busy={busy === "locate"} onClick={() => send("locate", undefined, "Localisation demandée")} />
        <Btn icon={Camera} label="Capture" busy={busy === "screenshot"} onClick={() => send("screenshot", undefined, "Capture demandée")} />
      </div>
      <form onSubmit={sendMessage} className="mt-3 flex gap-2">
        <input className="input flex-1" placeholder="Envoyer un message à l'enfant…" maxLength={200} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <button className="btn btn-outline shrink-0" disabled={!msg.trim() || busy === "message"}>
          {busy === "message" ? <Loader2 size={16} className="spinner" /> : <Send size={16} />} Envoyer
        </button>
      </form>
    </div>
  );
}

function Btn({ icon: Icon, label, busy, onClick }: { icon: typeof Lock; label: string; busy: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={busy} className="btn btn-ghost border">
      {busy ? <Loader2 size={16} className="spinner" /> : <Icon size={16} />} {label}
    </button>
  );
}
