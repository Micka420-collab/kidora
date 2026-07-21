import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { randomToken } from "@/lib/password";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { esc } from "@/lib/report-email";
import { siteUrl } from "@/lib/site";

const schema = z.object({ email: z.string().trim().email() });

// Always return the same response so we never reveal whether an account exists.
const GENERIC = {
  ok: true,
  message: "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé.",
};

// POST /api/auth/forgot { email } — start a password reset (emails a link if SMTP is set up).
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`forgot:${clientIp(req)}`, 5, 60 * 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Trop de demandes. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("Email invalide", 422);
  const email = parsed.data.email.toLowerCase();

  const parent = await prisma.parent.findUnique({ where: { email } });
  if (parent) {
    const token = randomToken(32);
    await prisma.parent.update({
      where: { id: parent.id },
      data: { resetToken: token, resetTokenExpiry: new Date(Date.now() + 60 * 60_000) }, // 1h
    });
    if (isMailConfigured()) {
      const link = `${siteUrl()}/reset?token=${token}`;
      await sendMail({
        to: email,
        subject: "Réinitialisation de votre mot de passe Kidora",
        html: `<p>Bonjour ${esc(parent.name)},</p><p>Vous avez demandé à réinitialiser votre mot de passe Kidora. Ce lien expire dans 1 heure :</p><p><a href="${esc(link)}">${esc(link)}</a></p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe reste inchangé.</p>`,
        text: `Réinitialisez votre mot de passe Kidora : ${link} (expire dans 1 h). Si ce n'est pas vous, ignorez cet email.`,
      }).catch(() => {});
    }
  }

  return json(GENERIC);
}
