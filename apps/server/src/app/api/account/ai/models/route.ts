import { json, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { fetchOpenRouterModels } from "@/lib/openrouter";

// GET /api/account/ai/models — live OpenRouter catalogue with prices ($/1M) and
// the recommended subset, for the model picker / comparison table. Proxied
// server-side (public data) to avoid CORS and add the "recommended" flag.
export async function GET() {
  return withGuard(async () => {
    await requireParent(); // parent-only, but no key needed (public endpoint)
    try {
      const models = await fetchOpenRouterModels();
      return json({ models });
    } catch {
      return apiError("Impossible de récupérer la liste des modèles OpenRouter.", 502);
    }
  });
}
