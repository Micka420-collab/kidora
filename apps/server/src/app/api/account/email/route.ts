import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { verifyPassword } from "@/lib/password";
import { signSession, setSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/ratelimit";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  email: z.string().trim().email().max(200),
});

// POST /api/account/email — change the account email (password-confirmed).
export async function POST(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const rl = rateLimit(`emailchange:${parent.id}:${clientIp(req)}`, 10, 15 * 60_000);
    if (!rl.ok) {
      return Response.json(
        { error: "Trop de tentatives. Réessayez plus tard." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Email invalide", 422);
    const { currentPassword } = parsed.data;
    const email = parsed.data.email.toLowerCase();

    const row = await prisma.parent.findUnique({
      where: { id: parent.id },
      select: { passwordHash: true, email: true },
    });
    if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
      return apiError("Mot de passe incorrect", 403);
    }
    if (email === row.email) return apiError("C'est déjà votre adresse email", 422);

    const taken = await prisma.parent.findUnique({ where: { email } });
    if (taken) return apiError("Cet email est déjà utilisé", 409);

    await prisma.parent.update({ where: { id: parent.id }, data: { email } });
    // Refresh the session cookie so its email claim stays in sync.
    await setSessionCookie(await signSession({ parentId: parent.id, email, tokenVersion: parent.tokenVersion }));
    await audit(parent.id, "account.email_change", email);
    return json({ ok: true, email });
  });
}
