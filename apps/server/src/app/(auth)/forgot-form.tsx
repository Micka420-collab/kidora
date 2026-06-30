"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { api } from "@/lib/client";
import { Loader2, MailCheck } from "lucide-react";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ message: string }>("/api/auth/forgot", { email });
      setDone(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-2xl font-extrabold">
          <Image src="/kidora-mark.svg" alt="" width={40} height={40} priority unoptimized />
          Kidora
        </Link>

        <div className="card p-8">
          <h1 className="text-2xl font-bold">Mot de passe oublié</h1>
          {done ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
              <MailCheck size={18} className="mt-0.5 shrink-0" /> {done}
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">Entrez votre email : nous vous enverrons un lien de réinitialisation.</p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" required />
                </div>
                {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
                <button className="btn btn-primary w-full py-3" disabled={busy || !email}>
                  {busy && <Loader2 size={16} className="spinner" />} Envoyer le lien
                </button>
              </form>
            </>
          )}
          <p className="mt-5 text-center text-sm text-muted">
            <Link href="/login" className="font-semibold text-brand-600">Retour à la connexion</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
