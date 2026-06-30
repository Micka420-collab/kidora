"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, ShieldQuestion, Loader2 } from "lucide-react";

export function AccountDataCard() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmText, password, code: code || undefined }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Erreur");
      }
      router.push("/login");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><ShieldQuestion size={18} /> Données & confidentialité</h2>
      <p className="mb-4 text-sm text-muted">Exportez ou supprimez l'ensemble de vos données (RGPD).</p>

      <a href="/api/account/export" download className="btn btn-outline">
        <Download size={16} /> Exporter mes données (JSON)
      </a>

      <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="font-semibold text-red-700">Zone de danger</div>
        <p className="mt-1 text-sm text-red-600">
          La suppression du compte efface définitivement vos enfants, appareils, règles et historiques.
        </p>
        {!confirming ? (
          <button className="btn btn-danger mt-3" onClick={() => setConfirming(true)}>
            <Trash2 size={16} /> Supprimer mon compte
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <label className="label text-red-700">Mot de passe actuel</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Votre mot de passe" autoComplete="current-password" />
            <label className="label text-red-700">Code 2FA (si activée)</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" />
            <label className="label text-red-700">Tapez « SUPPRIMER » pour confirmer</label>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="SUPPRIMER" />
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex gap-2">
              <button className="btn btn-danger" disabled={busy || confirmText !== "SUPPRIMER" || password.length < 1} onClick={deleteAccount}>
                {busy && <Loader2 size={16} className="spinner" />} Confirmer la suppression
              </button>
              <button className="btn btn-ghost" onClick={() => { setConfirming(false); setConfirmText(""); setPassword(""); setCode(""); setError(null); }}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
