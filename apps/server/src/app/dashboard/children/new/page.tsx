"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Loader2 } from "lucide-react";

const AVATARS = ["👧", "🧒", "👦", "🧑", "👶", "🐱", "🐶", "🦊", "🦁", "🐼", "🚀", "⭐"];

export default function NewChildPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("🧒");
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ child: { id: string } }>("/api/children", {
        name, avatar, birthDate: birthDate || undefined,
      });
      router.push(`/dashboard/children/${res.child.id}/devices`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-bold">Ajouter un enfant</h1>
      <p className="mb-6 text-sm text-muted">Créez un profil pour appliquer des règles personnalisées.</p>

      <form onSubmit={submit} className="card space-y-5 p-6">
        <div>
          <label className="label">Prénom</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Emma" required autoFocus />
        </div>

        <div>
          <label className="label">Avatar</label>
          <div className="flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAvatar(a)}
                className={`grid h-11 w-11 place-items-center rounded-xl text-2xl transition ${avatar === a ? "bg-brand-100 ring-2 ring-brand-500" : "bg-slate-50 hover:bg-slate-100"}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Date de naissance (optionnel)</label>
          <input type="date" className="input" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          <p className="mt-1 text-xs text-muted">Sert à proposer des règles adaptées à l'âge.</p>
        </div>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={loading}>
            {loading && <Loader2 size={16} className="spinner" />}
            Créer le profil
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Annuler</button>
        </div>
      </form>
    </div>
  );
}
