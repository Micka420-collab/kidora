import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { hashPassword, verifyPassword } from "@/lib/password";
import { passwordPolicyError, isPasswordBreached } from "@/lib/password-policy";
import { audit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/ratelimit";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

// POST /api/account/password — change the account password.
export async function POST(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const rl = rateLimit(`pwchange:${parent.id}:${clientIp(req)}`, 10, 15 * 60_000);
    if (!rl.ok) {
      return Response.json(
        { error: "Trop de tentatives. Réessayez plus tard." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);
    const { currentPassword, newPassword } = parsed.data;

    const row = await prisma.parent.findUnique({
      where: { id: parent.id },
      select: { passwordHash: true },
    });
    if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
      return apiError("Mot de passe actuel incorrect", 403);
    }
    if (currentPassword === newPassword) {
      return apiError("Le nouveau mot de passe doit être différent de l'actuel", 422);
    }

    const policyErr = passwordPolicyError(newPassword);
    if (policyErr) return apiError(policyErr, 422);
    if (await isPasswordBreached(newPassword)) {
      return apiError(
        "Ce mot de passe figure dans une fuite de données connue. Choisissez-en un autre.",
        422,
      );
    }

    await prisma.parent.update({
      where: { id: parent.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await audit(parent.id, "account.password_change", "Mot de passe modifié");
    return json({ ok: true });
  });
}
