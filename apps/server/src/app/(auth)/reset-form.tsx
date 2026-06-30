"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { api } from "@/lib/client";
import { passwordStrength } from "@/lib/password-strength";
import { Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";

const STRENGTH_COLORS = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];

export function ResetForm() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/api/auth/reset", { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  }

  const s = password ? passwordStrength(password) : null;

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-2xl font-extrabold">
          <Image src="/kidora-mark.svg" alt="" width={40} height={40} priority unoptimized />
          Kidora
        </Link>

        <div className="card p-8">
          <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
          {done ? (
            <div className="mt-4">
              <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> Mot de passe réinitialisé. Vous pouvez vous connecter.
              </div>
              <Link href="/login" className="btn btn-primary mt-5 w-full py-3">Se connecter</Link>
            </div>
          ) : !token ? (
            <p className="mt-4 text-sm text-red-600">Lien invalide. Refaites une demande depuis « Mot de passe oublié ».</p>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="label">Nouveau mot de passe</label>
                <div className="relative">
                  <input className="input pr-10" type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Masquer" : "Afficher"} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-muted hover:text-brand-600">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {s && (
                  <div className="mt-2 flex gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= s.score ? STRENGTH_COLORS[s.score] : "bg-slate-200"}`} />
                    ))}
                  </div>
                )}
              </div>
              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
              <button className="btn btn-primary w-full py-3" disabled={busy || password.length < 8}>
                {busy && <Loader2 size={16} className="spinner" />} Réinitialiser
              </button>
            </form>
          )}
          <p className="mt-5 text-center text-sm text-muted">
            <Link href="/login" className="font-semibold text-brand-600">Retour à la connexion</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
