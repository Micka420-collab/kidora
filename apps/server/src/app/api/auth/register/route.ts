import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, randomToken } from "@/lib/password";
import { passwordPolicyError, isPasswordBreached } from "@/lib/password-policy";
import { signSession, setSessionCookie } from "@/lib/auth";
import { apiError, json, readJson } from "@/lib/http";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { esc } from "@/lib/report-email";
import { siteUrl } from "@/lib/site";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`register:${ip}`, 5, 60 * 60_000); // 5/hour per IP
  if (!rl.ok) {
    return Response.json(
      { error: "Trop de créations de compte. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await readJson(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("Données invalides", 422);

  const { name, email, password } = parsed.data;

  // Password policy: strength + known-breach (HIBP k-anonymity).
  const policyErr = passwordPolicyError(password);
  if (policyErr) return apiError(policyErr, 422);
  if (await isPasswordBreached(password)) {
    return apiError("Ce mot de passe figure dans une fuite de données connue. Choisissez-en un autre.", 422);
  }

  const existing = await prisma.parent.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) return apiError("Cet email est déjà utilisé", 409);

  const parent = await prisma.parent.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      // Verify the email only when we can actually send the link; otherwise the
      // account is grandfathered as verified so SMTP-less setups aren't blocked.
      emailVerified: !isMailConfigured(),
      emailVerifyToken: isMailConfigured() ? randomToken(32) : null,
    },
  });

  if (parent.emailVerifyToken) {
    const link = `${siteUrl()}/api/auth/verify-email?token=${parent.emailVerifyToken}`;
    sendMail({
      to: parent.email,
      subject: "Confirmez votre adresse email — Kidora",
      html: `<p>Bonjour ${esc(parent.name)},</p><p>Bienvenue sur Kidora ! Confirmez votre adresse email en cliquant sur ce lien :</p><p><a href="${esc(link)}">${esc(link)}</a></p>`,
      text: `Bienvenue sur Kidora ! Confirmez votre email : ${link}`,
    }).catch(() => {});
  }

  const token = await signSession({ parentId: parent.id, email: parent.email, tokenVersion: parent.tokenVersion });
  await setSessionCookie(token);

  return json({ id: parent.id, name: parent.name, email: parent.email, token });
}
