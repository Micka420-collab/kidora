"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { MailWarning, X, Loader2 } from "lucide-react";

export function VerifyEmailBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (dismissed) return null;

  async function resend() {
    setBusy(true);
    setMsg(null);
    try {
      await api.post("/api/account/resend-verification");
      setMsg("Email de vérification renvoyé 📨");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <MailWarning size={18} className="shrink-0" />
      <span className="flex-1">Vérifiez votre adresse email pour sécuriser votre compte et permettre la récupération.</span>
      {msg ? (
        <span className="font-medium">{msg}</span>
      ) : (
        <button onClick={resend} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold transition hover:bg-amber-100">
          {busy && <Loader2 size={14} className="spinner" />} Renvoyer le lien
        </button>
      )}
      <button onClick={() => setDismissed(true)} aria-label="Fermer" className="text-amber-600 hover:text-amber-900"><X size={16} /></button>
    </div>
  );
}
