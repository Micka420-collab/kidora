import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { sanitizeMutedTypes } from "@/lib/alert-prefs";

const schema = z.object({ mutedTypes: z.array(z.string()).max(20) });

// PATCH /api/account/notifications — set which (mutable) alert types are muted.
export async function PATCH(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);

    const muted = sanitizeMutedTypes(parsed.data.mutedTypes);
    await prisma.parent.update({
      where: { id: parent.id },
      data: { alertPrefs: JSON.stringify(muted) },
    });
    return json({ ok: true, mutedTypes: muted });
  });
}
