"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { passwordStrength } from "@/lib/password-strength";
import { KeyRound, Loader2, Eye, EyeOff, Check } from "lucide-react";

const STRENGTH_COLORS = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];

function StrengthMeter({ value }: { value: string }) {
  if (!value) return null;
  const s = passwordStrength(value);
  return (
    <div className="mt-2 flex gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= s.score ? STRENGTH_COLORS[s.score] : "bg-slate-200"}`} />
      ))}
    </div>
  );
}

export function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      await api.post("/api/account/password", { currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><KeyRound size={18} /> Mot de passe</h2>
      <p className="mb-4 text-sm text-muted">Changez votre mot de passe. Le nouveau doit résister aux fuites connues.</p>

      <form onSubmit={submit} className="grid max-w-md gap-4">
        <div>
          <label className="label">Mot de passe actuel</label>
          <input
            className="input" type={show ? "text" : "password"} autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} required
          />
        </div>
        <div>
          <label className="label">Nouveau mot de passe</label>
          <div className="relative">
            <input
              className="input pr-10" type={show ? "text" : "password"} autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required
            />
            <button
              type="button" onClick={() => setShow((v) => !v)}
              aria-label={show ? "Masquer les mots de passe" : "Afficher les mots de passe"}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-muted hover:text-brand-600"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <StrengthMeter value={next} />
        </div>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        {done && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <Check size={16} /> Mot de passe mis à jour.
          </div>
        )}

        <button className="btn btn-primary w-fit" disabled={busy || !current || next.length < 8}>
          {busy && <Loader2 size={16} className="spinner" />}
          Mettre à jour
        </button>
      </form>
    </div>
  );
}
