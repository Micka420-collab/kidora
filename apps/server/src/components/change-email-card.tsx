"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { AtSign, Loader2, Check } from "lucide-react";

export function ChangeEmailCard({ current }: { current: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      await api.post("/api/account/email", { email, currentPassword: password });
      setPassword("");
      setEmail("");
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><AtSign size={18} /> Adresse email</h2>
      <p className="mb-4 text-sm text-muted">Actuelle : <span className="font-semibold">{current}</span></p>

      <form onSubmit={submit} className="grid max-w-md gap-4">
        <div>
          <label className="label">Nouvelle adresse email</label>
          <input
            className="input" type="email" autoComplete="email" placeholder="vous@exemple.com"
            value={email} onChange={(e) => setEmail(e.target.value)} required
          />
        </div>
        <div>
          <label className="label">Mot de passe (confirmation)</label>
          <input
            className="input" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} required
          />
        </div>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        {done && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <Check size={16} /> Adresse email mise à jour.
          </div>
        )}

        <button className="btn btn-primary w-fit" disabled={busy || !email || !password}>
          {busy && <Loader2 size={16} className="spinner" />}
          Mettre à jour
        </button>
      </form>
    </div>
  );
}
