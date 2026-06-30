import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { clearSessionCookie } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";

const schema = z.object({
  confirm: z.literal("SUPPRIMER"),
  password: z.string().min(1),
  code: z.string().optional(), // TOTP, required when 2FA is enabled
});

const prefsSchema = z.object({ weeklyReportEmail: z.boolean() });

// PATCH /api/account — update account preferences.
export async function PATCH(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const parsed = prefsSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);
    const updated = await prisma.parent.update({
      where: { id: parent.id },
      data: { weeklyReportEmail: parsed.data.weeklyReportEmail },
      select: { weeklyReportEmail: true },
    });
    return json(updated);
  });
}

// DELETE /api/account — permanently delete the account and all owned data.
export async function DELETE(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) {
      return apiError('Confirmation requise : mot de passe + "SUPPRIMER"', 422);
    }

    // Re-authenticate: this is irreversible, so require the current password
    // (and TOTP when 2FA is on) — a hijacked session alone must not be able to
    // wipe the account.
    const row = await prisma.parent.findUnique({
      where: { id: parent.id },
      select: { passwordHash: true, totpEnabled: true, totpSecret: true },
    });
    if (!row || !(await verifyPassword(parsed.data.password, row.passwordHash))) {
      return apiError("Mot de passe incorrect", 401);
    }
    if (row.totpEnabled && row.totpSecret) {
      if (!parsed.data.code || !verifyTotp(row.totpSecret, parsed.data.code)) {
        return apiError("Code de vérification 2FA invalide", 401);
      }
    }

    // Cascade deletes children, devices, rules, telemetry, alerts, audit, guardianships.
    await prisma.parent.delete({ where: { id: parent.id } });
    await clearSessionCookie();
    return json({ ok: true });
  });
}
