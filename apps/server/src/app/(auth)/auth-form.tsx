"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { passwordStrength } from "@/lib/password-strength";
import { Loader2, Eye, EyeOff } from "lucide-react";

const STRENGTH_COLORS = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];

function StrengthMeter({ value }: { value: string }) {
  if (!value) return null;
  const s = passwordStrength(value);
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= s.score ? STRENGTH_COLORS[s.score] : "bg-slate-200"}`} />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={s.score >= 3 ? "text-emerald-600" : s.score >= 2 ? "text-amber-600" : "text-red-600"}>{s.label}</span>
        {s.suggestions[0] && <span className="text-muted">{s.suggestions[0]}</span>}
      </div>
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await api.post("/api/auth/register", { name, email, password });
      } else {
        await api.post("/api/auth/login", { email, password, code: needs2fa ? code : undefined });
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Une erreur est survenue";
      if (mode === "login" && /vérification/i.test(msg)) {
        setNeeds2fa(true);
        setError(needs2fa ? msg : null); // first time: just reveal the field
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-2xl font-extrabold">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white">K</span>
          Kidora
        </Link>

        <div className="card p-8">
          <h1 className="text-2xl font-bold">
            {mode === "login" ? "Bon retour 👋" : "Créer votre compte"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "login"
              ? "Connectez-vous pour gérer votre famille."
              : "Quelques secondes pour protéger vos enfants."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "register" && (
              <div>
                <label className="label">Votre nom</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Marie Dupont" required />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" required />
            </div>
            <div>
              <label className="label">Mot de passe</label>
              <div className="relative">
                <input className="input pr-10" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={mode === "register" ? 8 : 1} required />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-muted hover:text-brand-600"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {mode === "register" && <StrengthMeter value={password} />}
            </div>

            {needs2fa && (
              <div>
                <label className="label">Code de vérification (2FA)</label>
                <input
                  className="input tracking-widest"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  autoFocus
                />
                <p className="mt-1 text-xs text-muted">Saisissez le code à 6 chiffres de votre application d&apos;authentification.</p>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
            )}

            <button className="btn btn-primary w-full py-3" disabled={loading}>
              {loading && <Loader2 size={16} className="spinner" />}
              {mode === "login" ? "Se connecter" : "Créer mon compte"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            {mode === "login" ? (
              <>Pas encore de compte ? <Link href="/register" className="font-semibold text-brand-600">Inscrivez-vous</Link></>
            ) : (
              <>Déjà inscrit ? <Link href="/login" className="font-semibold text-brand-600">Connectez-vous</Link></>
            )}
          </p>
        </div>

        {mode === "login" && (
          <button
            type="button"
            onClick={() => { setEmail("demo@kidora.app"); setPassword("kidora1234"); setError(null); }}
            className="mx-auto mt-4 block text-center text-xs text-muted hover:text-brand-600"
          >
            Essayer avec le compte démo <span className="font-medium">(demo@kidora.app)</span>
          </button>
        )}
      </div>
    </div>
  );
}
