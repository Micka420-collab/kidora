import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { randomToken } from "@/lib/password";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { esc } from "@/lib/report-email";
import { siteUrl } from "@/lib/site";

// POST /api/account/resend-verification — re-send the email-verification link.
export async function POST(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const rl = await rateLimit(`resendverify:${parent.id}:${clientIp(req)}`, 5, 60 * 60_000);
    if (!rl.ok) {
      return Response.json(
        { error: "Trop de demandes. Réessayez plus tard." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const row = await prisma.parent.findUnique({
      where: { id: parent.id },
      select: { email: true, name: true, emailVerified: true, pendingEmail: true },
    });
    // A pending email CHANGE re-sends to the pending mailbox even though the
    // current address is verified; otherwise nothing to do once verified.
    if (!row || (row.emailVerified && !row.pendingEmail)) return json({ ok: true, alreadyVerified: true });
    if (!isMailConfigured()) return apiError("L'envoi d'email n'est pas configuré sur ce serveur.", 400);

    const target = row.pendingEmail ?? row.email;
    const token = randomToken(32);
    await prisma.parent.update({
      where: { id: parent.id },
      data: { emailVerifyToken: token, emailVerifyTokenExpiry: new Date(Date.now() + 24 * 3600_000) },
    });
    const link = `${siteUrl()}/api/auth/verify-email?token=${token}`;
    await sendMail({
      to: target,
      subject: row.pendingEmail
        ? "Confirmez votre nouvelle adresse email — Kidora"
        : "Confirmez votre adresse email — Kidora",
      html: `<p>Bonjour ${esc(row.name)},</p><p>Confirmez votre adresse email en cliquant sur ce lien :</p><p><a href="${esc(link)}">${esc(link)}</a></p>`,
      text: `Confirmez votre email Kidora : ${link}`,
    }).catch(() => {});
    return json({ ok: true });
  });
}
