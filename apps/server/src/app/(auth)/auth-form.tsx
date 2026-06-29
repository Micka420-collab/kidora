"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Loader2 } from "lucide-react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        await api.post("/api/auth/login", { email, password });
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
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
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={mode === "register" ? 8 : 1} required />
            </div>

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
          <p className="mt-4 text-center text-xs text-muted">
            Démo : demo@kidora.app / kidora1234
          </p>
        )}
      </div>
    </div>
  );
}
