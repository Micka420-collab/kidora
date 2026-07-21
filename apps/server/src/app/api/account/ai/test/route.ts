import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { tryDecrypt } from "@/lib/crypto";
import { testOpenRouter } from "@/lib/openrouter";
import { rateLimit } from "@/lib/ratelimit";

const schema = z.object({
  model: z.string().min(1).max(120),
  apiKey: z.string().max(400).optional(), // use this key if given, else the stored one
});

// POST /api/account/ai/test — verify a key + model with a tiny completion.
export async function POST(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    // Each test spends the parent's OpenRouter quota — throttle it.
    const rl = await rateLimit(`aitest:${parent.id}`, 10, 5 * 60_000);
    if (!rl.ok) {
      return Response.json(
        { error: "Trop de tests. Réessayez plus tard." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);

    let apiKey = parsed.data.apiKey?.trim();
    if (!apiKey) {
      const row = await prisma.parent.findUnique({ where: { id: parent.id }, select: { aiApiKey: true } });
      if (row?.aiApiKey) {
        // Fail-closed: never send an undecryptable blob to OpenRouter — tell
        // the parent exactly what to do instead.
        const stored = tryDecrypt(row.aiApiKey);
        if (stored === null) return apiError("Clé enregistrée illisible (clé de chiffrement changée ?). Re-saisissez votre clé API.", 400);
        apiKey = stored;
      }
    }
    if (!apiKey) return apiError("Aucune clé API OpenRouter fournie.", 400);

    const err = await testOpenRouter(apiKey, parsed.data.model);
    if (err) return json({ ok: false, error: err });
    return json({ ok: true });
  });
}
