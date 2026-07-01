"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Sparkles, Loader2, Settings } from "lucide-react";

export function AiSummaryCard({ childId }: { childId: string }) {
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null); // null = still checking
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only offer generation when the parent actually configured AI — otherwise the
  // button would just 400. Checked once on mount.
  useEffect(() => {
    api.get<{ enabled: boolean }>("/api/account/ai")
      .then((c) => setAiEnabled(c.enabled))
      .catch(() => setAiEnabled(false));
  }, []);

  async function generate() {
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ summary: string }>(`/api/children/${childId}/ai-summary`, {});
      setSummary(r.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally { setBusy(false); }
  }

  // While checking, or when AI is off, keep the card unobtrusive.
  if (aiEnabled === null) return null;

  if (!aiEnabled) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="flex items-center gap-2 text-sm text-muted">
          <Sparkles size={18} className="text-brand-400" />
          Activez l&apos;IA (votre clé OpenRouter) pour un résumé hebdomadaire rédigé par votre modèle.
        </p>
        <a href="/dashboard/settings" className="btn btn-outline py-1.5 text-sm">
          <Settings size={15} /> Configurer l&apos;IA
        </a>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold"><Sparkles size={18} className="text-brand-500" /> Résumé de la semaine par IA</h3>
        <button className="btn btn-outline py-1.5 text-sm" onClick={generate} disabled={busy}>
          {busy ? <Loader2 size={15} className="spinner" /> : <Sparkles size={15} />} {summary ? "Régénérer" : "Générer"}
        </button>
      </div>
      <p className="mb-3 text-sm text-muted">
        Un résumé bienveillant rédigé par <b>votre modèle IA</b> à partir des statistiques agrégées de la semaine (aucun message privé n&apos;est envoyé).
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {summary ? (
        <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-4 text-sm leading-relaxed text-slate-700 whitespace-pre-line">{summary}</div>
      ) : !error && !busy ? (
        <p className="text-sm text-muted">Cliquez sur « Générer » pour obtenir le résumé de la semaine.</p>
      ) : null}
    </div>
  );
}
