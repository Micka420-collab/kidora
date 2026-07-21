import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { encrypt, hasStrongDataKey, tryDecrypt } from "@/lib/crypto";
import { audit } from "@/lib/audit";

// GET /api/account/ai — current AI (OpenRouter) config. Never returns the key.
export async function GET() {
  return withGuard(async () => {
    const parent = await requireParent();
    const row = await prisma.parent.findUnique({
      where: { id: parent.id },
      select: { aiEnabled: true, aiModel: true, aiApiKey: true },
    });
    return json({
      enabled: row?.aiEnabled ?? false,
      model: row?.aiModel ?? "",
      hasKey: !!row?.aiApiKey,
      // True → the stored key no longer decrypts (DATA_ENC_KEY rotated). The
      // LLM paths fail closed in that state, so tell the parent to re-enter it.
      keyUnreadable: !!row?.aiApiKey && tryDecrypt(row.aiApiKey) === null,
      // False → DATA_ENC_KEY isn't configured, so the stored key is encrypted
      // with the public dev fallback (weak). The UI warns the parent.
      secureStorage: hasStrongDataKey(),
    });
  });
}

const schema = z.object({
  enabled: z.boolean().optional(),
  model: z.string().max(120).optional(),
  apiKey: z.string().max(400).optional(), // "" clears; omitted leaves unchanged
});

// PUT /api/account/ai — update the config. The key is encrypted at rest.
export async function PUT(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);
    const { enabled, model, apiKey } = parsed.data;

    const current = await prisma.parent.findUnique({
      where: { id: parent.id },
      select: { aiApiKey: true, aiModel: true },
    });

    const data: { aiEnabled?: boolean; aiModel?: string; aiApiKey?: string | null } = {};
    if (model !== undefined) data.aiModel = model.trim();
    if (apiKey !== undefined) data.aiApiKey = apiKey.trim() === "" ? null : encrypt(apiKey.trim());

    if (enabled !== undefined) {
      if (enabled) {
        // Enabling requires both a key (kept or just provided) and a model.
        const willHaveKey = apiKey !== undefined ? apiKey.trim() !== "" : !!current?.aiApiKey;
        const willHaveModel = (data.aiModel ?? current?.aiModel ?? "").length > 0;
        if (!willHaveKey) return apiError("Ajoutez d'abord votre clé API OpenRouter.", 400);
        if (!willHaveModel) return apiError("Choisissez d'abord un modèle.", 400);
      }
      data.aiEnabled = enabled;
    }

    const updated = await prisma.parent.update({
      where: { id: parent.id },
      data,
      select: { aiEnabled: true, aiModel: true, aiApiKey: true },
    });
    await audit(parent.id, "account.ai_config", updated.aiEnabled ? `on:${updated.aiModel}` : "off");
    return json({ enabled: updated.aiEnabled, model: updated.aiModel, hasKey: !!updated.aiApiKey });
  });
}
