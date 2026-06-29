"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { api } from "@/lib/client";
import { ShieldCheck, Loader2, KeyRound } from "lucide-react";

type Status = { enabled: boolean };
type Enrollment = { secret: string; otpauth: string; qr: string };

export function TwoFactorCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [enroll, setEnroll] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.get<Status>("/api/account/2fa").then((s) => setEnabled(s.enabled)).catch(() => setEnabled(false));
  }, []);

  async function startEnroll() {
    setBusy(true); setMsg(null);
    try { setEnroll(await api.post<Enrollment>("/api/account/2fa", { action: "enroll" })); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setMsg(null);
    try {
      await api.post("/api/account/2fa", { action: "verify", code });
      setEnabled(true); setEnroll(null); setCode(""); setMsg("Double authentification activée ✅");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Code invalide"); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setMsg(null);
    try {
      await api.post("/api/account/2fa", { action: "disable", code });
      setEnabled(false); setCode(""); setMsg("Double authentification désactivée.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Code invalide"); }
    finally { setBusy(false); }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
        <ShieldCheck size={18} /> Double authentification (2FA)
      </h2>
      <p className="mb-4 text-sm text-muted">
        Protégez votre compte avec un code temporaire (Google Authenticator, Authy, 1Password…).
      </p>

      {enabled === null ? (
        <Loader2 size={16} className="spinner text-muted" />
      ) : enabled ? (
        <div className="space-y-3">
          <span className="badge bg-emerald-100 text-emerald-700">Activée</span>
          <div className="flex flex-wrap items-end gap-2">
            <input className="input w-40 tracking-widest" inputMode="numeric" maxLength={6} placeholder="Code à 6 chiffres" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <button className="btn btn-outline" onClick={disable} disabled={busy || code.length !== 6}>Désactiver</button>
          </div>
        </div>
      ) : enroll ? (
        <div className="space-y-3">
          <p className="text-sm">1. Scannez ce QR code dans votre application d&apos;authentification :</p>
          <Image src={enroll.qr} alt="QR 2FA" width={180} height={180} className="rounded-lg border" unoptimized />
          <p className="text-xs text-muted">Ou saisissez la clé manuellement : <code className="rounded bg-slate-100 px-1">{enroll.secret}</code></p>
          <p className="text-sm">2. Entrez le code généré pour confirmer :</p>
          <div className="flex flex-wrap items-end gap-2">
            <input className="input w-40 tracking-widest" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
            <button className="btn btn-primary" onClick={verify} disabled={busy || code.length !== 6}>
              {busy ? <Loader2 size={16} className="spinner" /> : <KeyRound size={16} />} Activer
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={startEnroll} disabled={busy}>
          {busy ? <Loader2 size={16} className="spinner" /> : <ShieldCheck size={16} />} Activer la 2FA
        </button>
      )}

      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
    </div>
  );
}
