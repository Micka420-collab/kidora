import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { verifyPassword, randomToken } from "@/lib/password";
import { signSession, setSessionCookie } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { esc } from "@/lib/report-email";
import { siteUrl } from "@/lib/site";

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
      select: { passwordHash: true, email: true, name: true },
    });
    if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
      return apiError("Mot de passe incorrect", 403);
    }
    if (email === row.email) return apiError("C'est déjà votre adresse email", 422);

    const taken = await prisma.parent.findUnique({ where: { email } });
    if (taken) return apiError("Cet email est déjà utilisé", 409);

    // Switching to a new mailbox re-opens verification: the new address must be
    // confirmed before it's trusted (alerts, weekly reports, password-reset all
    // go there). Otherwise a typo — or a hostile change — leaves the account
    // "verified" on an address the parent doesn't control. With no SMTP there's
    // no verification path, so it stays auto-verified (matches registration).
    const mailOn = isMailConfigured();
    const verifyToken = mailOn ? randomToken(32) : null;
    await prisma.parent.update({
      where: { id: parent.id },
      data: {
        email,
        emailVerified: !mailOn,
        emailVerifyToken: verifyToken,
        emailVerifyTokenExpiry: mailOn ? new Date(Date.now() + 24 * 3600_000) : null,
      },
    });
    if (verifyToken) {
      const link = `${siteUrl()}/api/auth/verify-email?token=${verifyToken}`;
      await sendMail({
        to: email,
        subject: "Confirmez votre nouvelle adresse email — Kidora",
        html: `<p>Bonjour ${esc(row.name)},</p><p>Confirmez votre nouvelle adresse email en cliquant sur ce lien :</p><p><a href="${esc(link)}">${esc(link)}</a></p>`,
        text: `Confirmez votre nouvelle adresse email Kidora : ${link}`,
      }).catch(() => {});
    }
    // Refresh the session cookie so its email claim stays in sync.
    await setSessionCookie(await signSession({ parentId: parent.id, email, tokenVersion: parent.tokenVersion }));
    await audit(parent.id, "account.email_change", email);
    return json({ ok: true, email, verificationRequired: mailOn });
  });
}
