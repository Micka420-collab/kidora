"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Bot, Loader2, ExternalLink, Check, Search, Sparkles } from "lucide-react";

type Config = { enabled: boolean; model: string; hasKey: boolean; secureStorage?: boolean };
type Model = {
  id: string;
  name: string;
  promptPer1M: number;
  completionPer1M: number;
  contextLength: number;
  recommended: boolean;
};

const money = (n: number) => (n === 0 ? "gratuit" : `$${n.toFixed(n < 1 ? 2 : 2)}`);
const ctx = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n || "—"));

export function AiConfigCard() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [replaceKey, setReplaceKey] = useState(false);
  const [selModel, setSelModel] = useState("");
  const [models, setModels] = useState<Model[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.get<Config>("/api/account/ai")
      .then((c) => { setCfg(c); setSelModel(c.model); })
      .catch(() => setCfg({ enabled: false, model: "", hasKey: false }));
  }, []);

  const loadModels = useCallback(async () => {
    if (models || loadingModels) return;
    setLoadingModels(true);
    try {
      const r = await api.get<{ models: Model[] }>("/api/account/ai/models");
      setModels(r.models);
    } catch {
      setMsg({ ok: false, text: "Impossible de charger la liste des modèles." });
    } finally {
      setLoadingModels(false);
    }
  }, [models, loadingModels]);

  const keyToSend = () => (replaceKey || !cfg?.hasKey ? apiKey.trim() : undefined);

  async function save(enabled: boolean) {
    setBusy(true); setMsg(null);
    try {
      const body: { enabled: boolean; model: string; apiKey?: string } = { enabled, model: selModel };
      const k = keyToSend();
      if (k !== undefined && k !== "") body.apiKey = k;
      const c = await api.put<Config>("/api/account/ai", body);
      setCfg(c); setApiKey(""); setReplaceKey(false);
      setMsg({ ok: true, text: enabled ? "IA activée ✅" : "Configuration enregistrée." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erreur" });
    } finally { setBusy(false); }
  }

  async function test() {
    if (!selModel) return;
    setBusy(true); setMsg(null);
    try {
      const body: { model: string; apiKey?: string } = { model: selModel };
      const k = keyToSend();
      if (k !== undefined && k !== "") body.apiKey = k;
      const r = await api.post<{ ok: boolean; error?: string }>("/api/account/ai/test", body);
      setMsg(r.ok ? { ok: true, text: "Connexion réussie ✅ La clé et le modèle fonctionnent." } : { ok: false, text: r.error ?? "Échec du test." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erreur" });
    } finally { setBusy(false); }
  }

  if (!cfg) return <div className="card grid place-items-center p-8"><Loader2 className="spinner text-muted" /></div>;

  const f = filter.trim().toLowerCase();
  const list = (models ?? []).filter((m) => !f || m.id.toLowerCase().includes(f) || m.name.toLowerCase().includes(f));
  const shown = showAll || f ? list.slice(0, 60) : list.filter((m) => m.recommended);

  return (
    <div className="card p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><Bot size={18} /> Détection de risque par IA</h2>
      <p className="mb-4 text-sm text-muted">
        Optionnel : utilisez votre <b>propre clé OpenRouter</b> et le modèle de votre choix (DeepSeek, GPT-4o-mini…) pour analyser
        les messages &amp; recherches. Sans clé, l&apos;analyse heuristique intégrée reste active.
        {cfg.enabled && <span className="ml-1 badge bg-emerald-100 text-emerald-700">Active · {cfg.model}</span>}
      </p>

      {/* API key */}
      <div className="mb-4">
        <label className="label">Clé API OpenRouter</label>
        {cfg.hasKey && !replaceKey ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="badge bg-slate-100 text-slate-600"><Check size={13} className="mr-1 inline" />Clé enregistrée</span>
            <button className="text-brand-600 hover:underline" onClick={() => setReplaceKey(true)}>Remplacer</button>
          </div>
        ) : (
          <>
            <input className="input font-mono" type="password" autoComplete="off" placeholder="sk-or-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <p className="mt-1 text-xs text-muted">
              Obtenez une clé sur <a className="text-brand-600 hover:underline" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys <ExternalLink size={11} className="inline" /></a>. Stockée chiffrée, jamais réaffichée.
            </p>
          </>
        )}
        {cfg.hasKey && cfg.secureStorage === false && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠️ La variable <code className="font-mono">DATA_ENC_KEY</code> n&apos;est pas configurée sur le serveur : votre clé est
            stockée avec un chiffrement de développement (faible). Définissez <code className="font-mono">DATA_ENC_KEY</code> (32
            octets) puis ré-enregistrez la clé pour un chiffrement fort.
          </p>
        )}
      </div>

      {/* Model picker + comparison */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="label mb-0">Modèle {selModel && <span className="font-mono text-xs text-brand-600">· {selModel}</span>}</label>
          {models && (
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input py-1 pl-7 text-sm" placeholder="Rechercher un modèle…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
          )}
        </div>

        {!models ? (
          <button className="btn btn-outline" onClick={loadModels} disabled={loadingModels}>
            {loadingModels ? <Loader2 size={16} className="spinner" /> : <Sparkles size={16} />} Comparer les modèles &amp; prix
          </button>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-muted">
                <tr>
                  <th className="p-2"></th>
                  <th className="p-2">Modèle</th>
                  <th className="p-2 text-right">Entrée /1M</th>
                  <th className="p-2 text-right">Sortie /1M</th>
                  <th className="p-2 text-right">Contexte</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.id} className={`cursor-pointer border-t hover:bg-slate-50 ${selModel === m.id ? "bg-brand-50" : ""}`} onClick={() => setSelModel(m.id)}>
                    <td className="p-2"><input type="radio" checked={selModel === m.id} onChange={() => setSelModel(m.id)} aria-label={m.name} /></td>
                    <td className="p-2">
                      <div className="font-medium">{m.name} {m.recommended && <span className="badge bg-brand-100 text-brand-700">Recommandé</span>}</div>
                      <div className="font-mono text-[11px] text-muted">{m.id}</div>
                    </td>
                    <td className="p-2 text-right tabular-nums">{money(m.promptPer1M)}</td>
                    <td className="p-2 text-right tabular-nums">{money(m.completionPer1M)}</td>
                    <td className="p-2 text-right tabular-nums">{ctx(m.contextLength)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!showAll && !f && (
              <button className="w-full border-t bg-slate-50 p-2 text-xs text-brand-600 hover:underline" onClick={() => setShowAll(true)}>
                Afficher tous les modèles ({(models ?? []).length}) →
              </button>
            )}
          </div>
        )}
      </div>

      {/* actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-outline" onClick={test} disabled={busy || !selModel}>{busy ? <Loader2 size={16} className="spinner" /> : null} Tester</button>
        <button className="btn btn-outline" onClick={() => save(false)} disabled={busy || !selModel}>Enregistrer</button>
        {cfg.enabled ? (
          <button className="btn btn-danger" onClick={() => save(false)} disabled={busy}>Désactiver l&apos;IA</button>
        ) : (
          <button className="btn btn-primary" onClick={() => save(true)} disabled={busy || !selModel || (!cfg.hasKey && !apiKey.trim())}>Activer l&apos;IA</button>
        )}
      </div>

      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
