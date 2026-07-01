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

/**
 * Fetch the live model catalogue (public endpoint, no key needed). Normalizes
 * pricing to $/1M tokens and flags the recommended subset. Recommended first,
 * then cheapest.
 */
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
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

export { CHAT_URL, REFERER, TITLE };
