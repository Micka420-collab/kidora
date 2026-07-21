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

    // Double opt-in: the ACTIVE address must not switch before the new mailbox
    // is confirmed — otherwise a typo (or a hostile change) locks the parent
    // out of login/password-reset, and an unconfirmed address squats the
    // unique email slot. The request parks in `pendingEmail`; /verify-email
    // applies the switch. With no SMTP there's no verification path, so the
    // switch stays immediate (matches registration behaviour).
    const mailOn = isMailConfigured();
    if (mailOn) {
      const verifyToken = randomToken(32);
      await prisma.parent.update({
        where: { id: parent.id },
        data: {
          pendingEmail: email,
          emailVerifyToken: verifyToken,
          emailVerifyTokenExpiry: new Date(Date.now() + 24 * 3600_000),
        },
      });
      const link = `${siteUrl()}/api/auth/verify-email?token=${verifyToken}`;
      await sendMail({
        to: email,
        subject: "Confirmez votre nouvelle adresse email — Kidora",
        html: `<p>Bonjour ${esc(row.name)},</p><p>Confirmez votre nouvelle adresse email en cliquant sur ce lien :</p><p><a href="${esc(link)}">${esc(link)}</a></p><p>Votre adresse actuelle reste active tant que la nouvelle n'est pas confirmée.</p>`,
        text: `Confirmez votre nouvelle adresse email Kidora : ${link}`,
      }).catch(() => {});
      // Heads-up to the CURRENT mailbox so a hijacked session can't silently
      // migrate the account (best-effort).
      await sendMail({
        to: row.email,
        subject: "Changement d'adresse email demandé — Kidora",
        html: `<p>Bonjour ${esc(row.name)},</p><p>Un changement de votre adresse email vers <b>${esc(email)}</b> a été demandé. Si ce n'est pas vous, changez votre mot de passe immédiatement.</p>`,
        text: `Un changement de votre adresse email Kidora vers ${email} a été demandé. Si ce n'est pas vous, changez votre mot de passe immédiatement.`,
      }).catch(() => {});
      await audit(parent.id, "account.email_change_requested", email);
      return json({ ok: true, email: row.email, pendingEmail: email, verificationRequired: true });
    }

    await prisma.parent.update({
      where: { id: parent.id },
      data: { email, emailVerified: true, pendingEmail: null, emailVerifyToken: null, emailVerifyTokenExpiry: null },
    });
    // Refresh the session cookie so its email claim stays in sync.
    await setSessionCookie(await signSession({ parentId: parent.id, email, tokenVersion: parent.tokenVersion }));
    await audit(parent.id, "account.email_change", email);
    return json({ ok: true, email, verificationRequired: false });
  });
}

// DELETE /api/account/email — cancel a pending (unconfirmed) email change.
export async function DELETE() {
  return withGuard(async () => {
    const parent = await requireParent();
    const row = await prisma.parent.findUnique({
      where: { id: parent.id },
      select: { pendingEmail: true },
    });
    // No pending change: leave any verification token alone — it may belong to
    // the registration/current-address verification flow.
    if (!row?.pendingEmail) return json({ ok: true });
    await prisma.parent.update({
      where: { id: parent.id },
      data: { pendingEmail: null, emailVerifyToken: null, emailVerifyTokenExpiry: null },
    });
    await audit(parent.id, "account.email_change_cancelled", row.pendingEmail);
    return json({ ok: true });
  });
}
