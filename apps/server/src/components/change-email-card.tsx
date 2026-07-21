"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { AtSign, Loader2, Check, MailQuestion } from "lucide-react";

export function ChangeEmailCard({ current, pending }: { current: string; pending?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "switched" | "pending">(null);
  const [resent, setResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const res = await api.post<{ verificationRequired: boolean }>("/api/account/email", {
        email,
        currentPassword: password,
      });
      setPassword("");
      setEmail("");
      setDone(res.verificationRequired ? "pending" : "switched");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    await api.post("/api/account/resend-verification", {});
    setResent(true);
    setTimeout(() => setResent(false), 2500);
  }
  async function cancelPending() {
    await api.del("/api/account/email");
    setDone(null);
    router.refresh();
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><AtSign size={18} /> Adresse email</h2>
      <p className="mb-4 text-sm text-muted">Actuelle : <span className="font-semibold">{current}</span></p>

      {pending && (
        <div className="mb-4 max-w-md rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="flex items-center gap-2 font-medium"><MailQuestion size={16} /> En attente de confirmation : {pending}</p>
          <p className="mt-1 text-amber-700">
            Votre adresse actuelle reste active tant que la nouvelle n&apos;est pas confirmée depuis sa boîte mail.
          </p>
          <div className="mt-2 flex gap-3">
            <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={resend}>
              {resent ? "Lien renvoyé ✓" : "Renvoyer le lien"}
            </button>
            <button type="button" className="font-semibold text-red-600 hover:underline" onClick={cancelPending}>
              Annuler le changement
            </button>
          </div>
        </div>
      )}

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
        {done === "switched" && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <Check size={16} /> Adresse email mise à jour.
          </div>
        )}
        {done === "pending" && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <Check size={16} /> Lien de confirmation envoyé à la nouvelle adresse. Elle deviendra active une fois confirmée.
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
