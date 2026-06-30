import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, dummyVerify } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";
import { signSession, setSessionCookie } from "@/lib/auth";
import { apiError, json, readJson } from "@/lib/http";
import { rateLimit, clientIp, loginLockStatus, recordLoginFailure, clearLoginFailures } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  code: z.string().optional(), // TOTP code, required when 2FA is enabled
});

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`login:${ip}`, 10, 5 * 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await readJson(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("Données invalides", 422);

  const { email, password } = parsed.data;
  const lockKey = `${email.toLowerCase()}|${ip}`;

  // Progressive lockout after repeated failures (brute-force protection).
  const lock = loginLockStatus(lockKey);
  if (lock.locked) {
    return Response.json(
      { error: `Trop de tentatives échouées. Compte temporairement verrouillé (${Math.ceil(lock.retryAfter / 60)} min).` },
      { status: 429, headers: { "Retry-After": String(lock.retryAfter) } },
    );
  }

  const parent = await prisma.parent.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!parent) {
    await dummyVerify(password); // equalize timing so a missing account isn't faster
    recordLoginFailure(lockKey);
    return apiError("Email ou mot de passe incorrect", 401);
  }

  const ok = await verifyPassword(password, parent.passwordHash);
  if (!ok) {
    recordLoginFailure(lockKey);
    return apiError("Email ou mot de passe incorrect", 401);
  }

  // Second factor (TOTP) when enabled.
  if (parent.totpEnabled && parent.totpSecret) {
    const { code } = parsed.data;
    if (!code) {
      return Response.json({ twoFactor: true, error: "Code de vérification requis." }, { status: 401 });
    }
    if (!verifyTotp(parent.totpSecret, code)) {
      recordLoginFailure(lockKey);
      return Response.json({ twoFactor: true, error: "Code de vérification invalide." }, { status: 401 });
    }
  }

  clearLoginFailures(lockKey);
  const token = await signSession({ parentId: parent.id, email: parent.email });
  await setSessionCookie(token);
  await audit(parent.id, "login", undefined, ip);

  // token is also returned for non-browser clients (mobile app)
  return json({ id: parent.id, name: parent.name, email: parent.email, token });
}
