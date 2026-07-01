// OpenRouter integration for optional LLM-based risk detection. The parent
// supplies their OWN API key (stored encrypted); this module lists models with
// live prices, tests a key, and (see analyzeRiskWithLLM) scores text.

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
// Sent as attribution headers (recommended by OpenRouter).
const REFERER = "https://github.com/Micka420-collab/kidora";
const TITLE = "Kidora";

// Curated models that balance cost and quality for short FR/EN safety-scoring —
// surfaced first in the picker. (The full live list is still shown.)
export const RECOMMENDED_MODELS = new Set<string>([
  "deepseek/deepseek-chat",
  "openai/gpt-4o-mini",
  "google/gemini-flash-1.5",
  "anthropic/claude-3-haiku",
  "meta-llama/llama-3.3-70b-instruct",
  "mistralai/mistral-nemo",
]);

export type OpenRouterModel = {
  id: string;
  name: string;
  /** USD per 1M prompt tokens. */
  promptPer1M: number;
  /** USD per 1M completion tokens. */
  completionPer1M: number;
  contextLength: number;
  recommended: boolean;
};

/** Convert an OpenRouter per-token price string to USD per 1M tokens (3 dp). */
export function pricePer1M(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 1_000_000 * 1000) / 1000 : 0;
}

// Small in-instance cache — the catalogue changes rarely and every parent opening
// the picker would otherwise re-fetch ~300 models.
let modelCache: { at: number; models: OpenRouterModel[] } | null = null;
const MODELS_TTL_MS = 60 * 60 * 1000; // 1h

/**
 * Fetch the live model catalogue (public endpoint, no key needed). Normalizes
 * pricing to $/1M tokens and flags the recommended subset. Recommended first,
 * then cheapest. Cached for 1h per instance.
 */
export async function fetchOpenRouterModels(nowMs = 0): Promise<OpenRouterModel[]> {
  if (modelCache && nowMs && nowMs - modelCache.at < MODELS_TTL_MS) return modelCache.models;
  const res = await fetch(MODELS_URL, { headers: { "HTTP-Referer": REFERER, "X-Title": TITLE } });
  if (!res.ok) throw new Error(`OpenRouter models: ${res.status}`);
  const body = (await res.json()) as { data?: unknown[] };
  const rows = Array.isArray(body.data) ? body.data : [];
  const models: OpenRouterModel[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const id = typeof r.id === "string" ? r.id : "";
    if (!id) continue;
    const pricing = (r.pricing ?? {}) as Record<string, unknown>;
    models.push({
      id,
      name: typeof r.name === "string" ? r.name : id,
      promptPer1M: pricePer1M(pricing.prompt),
      completionPer1M: pricePer1M(pricing.completion),
      contextLength: Number(r.context_length) || 0,
      recommended: RECOMMENDED_MODELS.has(id),
    });
  }
  models.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return a.promptPer1M + a.completionPer1M - (b.promptPer1M + b.completionPer1M);
  });
  if (nowMs) modelCache = { at: nowMs, models };
  return models;
}

/** Verify a key + model with a tiny, cheap completion. Returns null on success,
 *  or a short error message. */
export async function testOpenRouter(apiKey: string, model: string): Promise<string | null> {
  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": REFERER,
        "X-Title": TITLE,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (res.ok) return null;
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return err.error?.message ?? `Erreur ${res.status}`;
  } catch (e) {
    return e instanceof Error ? e.message : "Connexion impossible";
  }
}

// ── LLM risk scoring ──────────────────────────────────────────────────────
import { analyzeRisk, levelFor, type RiskLevel } from "./risk";

/** Per-sync AI context: decrypted key, model, and a shared LLM-call budget. */
export type AiRiskCtx = { apiKey: string; model: string; budget: { n: number } } | null;

/**
 * Risk score for a text: always the fast heuristic, and — when the parent has
 * AI enabled and the per-sync budget isn't exhausted — refined by their chosen
 * LLM (the more severe of the two wins; LLM catches subtler grooming/context the
 * heuristic misses). Any LLM failure silently falls back to the heuristic.
 * The budget is decremented synchronously so Promise.all callers stay bounded.
 */
export async function combinedRisk(
  text: string,
  ctx: AiRiskCtx,
): Promise<{ score: number; level: RiskLevel; topCategory: string | null }> {
  const h = analyzeRisk(text);
  const heur = { score: h.score, level: h.level, topCategory: h.topCategory };
  if (!ctx || ctx.budget.n <= 0) return heur;
  ctx.budget.n -= 1;
  const llm = await analyzeRiskWithLLM(ctx.apiKey, ctx.model, text);
  if (!llm) return heur;
  return llm.score >= heur.score ? { ...llm, topCategory: llm.topCategory ?? heur.topCategory } : heur;
}

const RISK_CATEGORIES = ["automutilation", "grooming", "harcelement", "sexuel", "drogues", "violence", "none"] as const;

const SYSTEM_PROMPT =
  "Tu es un système de sécurité pour le contrôle parental. On te donne un court texte (message ou recherche) provenant de l'appareil d'un enfant mineur. Évalue le RISQUE POUR L'ENFANT — automutilation/suicide, prédation/grooming, harcèlement, contenu sexuel, drogues, violence. " +
  "Réponds UNIQUEMENT par un objet JSON strict, sans texte autour : " +
  '{"score": <entier 0-100>, "category": "<automutilation|grooming|harcelement|sexuel|drogues|violence|none>"}. ' +
  "0 = aucun risque, 100 = danger critique immédiat. Usage défensif de protection de l'enfant uniquement.";

/**
 * Score a text with the parent's chosen OpenRouter model. Returns a
 * RiskResult-shaped object, or null on any error/timeout (caller falls back to
 * the heuristic). Bounded: short timeout, tiny max_tokens, JSON output.
 */
export async function analyzeRiskWithLLM(
  apiKey: string,
  model: string,
  text: string,
  timeoutMs = 6000,
): Promise<{ score: number; level: RiskLevel; topCategory: string | null } | null> {
  const clean = (text || "").slice(0, 2000);
  if (!clean.trim()) return { score: 0, level: "none", topCategory: null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": REFERER,
        "X-Title": TITLE,
      },
      body: JSON.stringify({
        model,
        max_tokens: 40,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: clean },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { score?: unknown; category?: unknown };
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
    if (!Number.isFinite(score)) return null;
    const cat = typeof parsed.category === "string" && (RISK_CATEGORIES as readonly string[]).includes(parsed.category) && parsed.category !== "none"
      ? parsed.category
      : null;
    return { score, level: levelFor(score), topCategory: cat };
  } catch {
    return null; // timeout / network / bad JSON → heuristic fallback
  } finally {
    clearTimeout(timer);
  }
}

const SUMMARY_SYSTEM =
  "Tu es un assistant bienveillant de contrôle parental (Kidora). À partir de STATISTIQUES HEBDOMADAIRES agrégées (aucun contenu privé, aucun message), rédige pour le parent un court résumé en français : 3 à 5 phrases, ton chaleureux et rassurant, non-alarmiste. Souligne les points positifs, mentionne factuellement ce qui ressort, et termine par 1 ou 2 suggestions douces. N'invente aucune donnée absente. Réponds uniquement par le texte du résumé, sans titre ni puces.";

/**
 * Generate a warm weekly summary for the parent from AGGREGATE stats only
 * (no message/search content). Returns the text, or null on error.
 */
export async function summarizeWeekWithLLM(
  apiKey: string,
  model: string,
  data: unknown,
  timeoutMs = 15000,
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": REFERER,
        "X-Title": TITLE,
      },
      body: JSON.stringify({
        model,
        max_tokens: 320,
        temperature: 0.4,
        messages: [
          { role: "system", content: SUMMARY_SYSTEM },
          { role: "user", content: JSON.stringify(data) },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export { CHAT_URL, REFERER, TITLE };
