import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { clearSessionCookie } from "@/lib/auth";

const schema = z.object({ confirm: z.literal("SUPPRIMER") });

// DELETE /api/account — permanently delete the account and all owned data.
export async function DELETE(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) {
      return apiError('Confirmation requise : tapez "SUPPRIMER"', 422);
    }
    // Cascade deletes children, devices, rules, telemetry, alerts, audit, guardianships.
    await prisma.parent.delete({ where: { id: parent.id } });
    await clearSessionCookie();
    return json({ ok: true });
  });
}
