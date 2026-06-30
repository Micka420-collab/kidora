import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { passwordPolicyError, isPasswordBreached } from "@/lib/password-policy";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

const schema = z.object({
  token: z.string().min(10).max(200),
  newPassword: z.string().min(8).max(200),
});

// POST /api/auth/reset { token, newPassword } — complete a password reset.
export async function POST(req: NextRequest) {
  const rl = rateLimit(`reset:${clientIp(req)}`, 10, 60 * 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("Données invalides", 422);
  const { token, newPassword } = parsed.data;

  const parent = await prisma.parent.findFirst({
    where: { resetToken: token, resetTokenExpiry: { gt: new Date() } },
    select: { id: true },
  });
  if (!parent) return apiError("Lien invalide ou expiré. Refaites une demande.", 400);

  const policyErr = passwordPolicyError(newPassword);
  if (policyErr) return apiError(policyErr, 422);
  if (await isPasswordBreached(newPassword)) {
    return apiError("Ce mot de passe figure dans une fuite de données connue. Choisissez-en un autre.", 422);
  }

  await prisma.parent.update({
    where: { id: parent.id },
    data: { passwordHash: await hashPassword(newPassword), resetToken: null, resetTokenExpiry: null },
  });
  await audit(parent.id, "account.password_reset", "Mot de passe réinitialisé");
  return json({ ok: true });
}
