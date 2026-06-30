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
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

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
      const r = await api.post<{ enabled: boolean; backupCodes?: string[] }>("/api/account/2fa", { action: "verify", code });
      setEnabled(true); setEnroll(null); setCode(""); setMsg("Double authentification activée ✅");
      setBackupCodes(r.backupCodes ?? null);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Code invalide"); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setMsg(null);
    try {
      await api.post("/api/account/2fa", { action: "disable", code });
      setEnabled(false); setCode(""); setBackupCodes(null); setMsg("Double authentification désactivée.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Code invalide"); }
    finally { setBusy(false); }
  }
  function copyCodes() {
    if (backupCodes) navigator.clipboard?.writeText(backupCodes.join("\n")).catch(() => {});
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
        <ShieldCheck size={18} /> Double authentification (2FA)
      </h2>
      <p className="mb-4 text-sm text-muted">
        Protégez votre compte avec un code temporaire (Google Authenticator, Authy, 1Password…).
      </p>

      {backupCodes ? (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">🔑 Vos codes de secours (à conserver précieusement)</p>
          <p className="text-xs text-amber-700">
            Chaque code ne sert qu&apos;une fois et vous permet de vous connecter ou de désactiver la 2FA si vous perdez votre application d&apos;authentification. Ils ne seront plus affichés.
          </p>
          <ul className="grid grid-cols-2 gap-1.5 font-mono text-sm">
            {backupCodes.map((c) => (<li key={c} className="rounded bg-white px-2 py-1 text-center tracking-wider">{c}</li>))}
          </ul>
          <div className="flex gap-2">
            <button className="btn btn-outline py-1.5 text-sm" onClick={copyCodes}>Copier</button>
            <button className="btn btn-primary py-1.5 text-sm" onClick={() => setBackupCodes(null)}>J&apos;ai noté ces codes</button>
          </div>
        </div>
      ) : enabled === null ? (
        <Loader2 size={16} className="spinner text-muted" />
      ) : enabled ? (
        <div className="space-y-3">
          <span className="badge bg-emerald-100 text-emerald-700">Activée</span>
          <p className="text-xs text-muted">Pour désactiver, saisissez un code de votre application <em>ou</em> un code de secours.</p>
          <div className="flex flex-wrap items-end gap-2">
            <input className="input w-48 tracking-widest" autoCapitalize="characters" maxLength={12} placeholder="Code 2FA ou de secours" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn btn-outline" onClick={disable} disabled={busy || code.trim().length < 6}>Désactiver</button>
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
