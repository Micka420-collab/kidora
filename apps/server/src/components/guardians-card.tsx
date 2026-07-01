"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Loader2, UserPlus, Trash2, Users } from "lucide-react";

type Guardian = { id: string; name: string; email: string; children: string[] };

export function GuardiansCard() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function load() {
    const res = await api.get<{ guardians: Guardian[] }>("/api/guardians");
    setGuardians(res.guardians);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ added: string; children: number }>("/api/guardians", { email: email.trim() });
      setMsg({ kind: "ok", text: `${res.added} a maintenant accès à ${res.children} enfant(s).` });
      setEmail("");
      load();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erreur" });
    } finally {
      setBusy(false);
    }
  }
  async function remove(g: Guardian) {
    // Destructive (revokes another adult's access to all shared children) →
    // confirm, and roll back if the request fails.
    if (!confirm(`Retirer ${g.name} ? Cette personne n'aura plus accès à vos enfants.`)) return;
    const prev = guardians;
    setGuardians((gs) => gs.filter((x) => x.id !== g.id));
    try {
      await api.del(`/api/guardians?parentId=${g.id}`);
    } catch {
      setGuardians(prev);
      setMsg({ kind: "err", text: "Échec du retrait. Réessayez." });
    }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><Users size={18} /> Co-parents & tuteurs</h2>
      <p className="mb-4 text-sm text-muted">Partagez la gestion de vos enfants avec un autre adulte (il doit avoir un compte Kidora).</p>

      <form onSubmit={add} className="mb-4 flex gap-2">
        <input className="input flex-1" type="email" placeholder="email@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn btn-primary" disabled={busy}>
          {busy ? <Loader2 size={16} className="spinner" /> : <UserPlus size={16} />} Inviter
        </button>
      </form>

      {msg && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center py-6"><Loader2 className="spinner text-muted" /></div>
      ) : guardians.length === 0 ? (
        <p className="text-sm text-muted">Aucun co-parent pour l'instant.</p>
      ) : (
        <div className="divide-y">
          {guardians.map((g) => (
            <div key={g.id} className="flex items-center justify-between py-2.5">
              <div>
                <div className="text-sm font-medium">{g.name}</div>
                <div className="text-xs text-muted">{g.email} · accès à {g.children.length} enfant(s)</div>
              </div>
              <button className="text-slate-400 hover:text-red-500" onClick={() => remove(g)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
