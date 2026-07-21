import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, dummyVerify } from "@/lib/password";
import { verifyTotp } from "@/lib/totp";
import { decrypt } from "@/lib/crypto";
import { consumeBackupCode, parseBackupHashes } from "@/lib/backup-codes";
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
  const rl = await rateLimit(`login:${ip}`, 10, 5 * 60_000);
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
  const lock = await loginLockStatus(lockKey);
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
    await recordLoginFailure(lockKey);
    return apiError("Email ou mot de passe incorrect", 401);
  }

  const ok = await verifyPassword(password, parent.passwordHash);
  if (!ok) {
    await recordLoginFailure(lockKey);
    return apiError("Email ou mot de passe incorrect", 401);
  }

  // Second factor (TOTP, or a one-time backup/recovery code) when enabled.
  if (parent.totpEnabled && parent.totpSecret) {
    const { code } = parsed.data;
    if (!code) {
      return Response.json({ twoFactor: true, error: "Code de vérification requis." }, { status: 401 });
    }
    if (verifyTotp(decrypt(parent.totpSecret), code)) {
      // ok
    } else {
      // Fall back to a recovery code; consume it so it can't be reused.
      const prevCodes = parent.totpBackupCodes;
      const remaining = consumeBackupCode(code, parseBackupHashes(prevCodes));
      if (remaining === null) {
        await recordLoginFailure(lockKey);
        return Response.json({ twoFactor: true, error: "Code de vérification invalide." }, { status: 401 });
      }
      // Compare-and-swap: only consume if the stored codes are still exactly what
      // we read. Two concurrent logins with the SAME one-time code would both pass
      // the check above (read-modify-write race); guarding the write on the prior
      // value lets exactly one win, so a recovery code can never be spent twice.
      const consumed = await prisma.parent.updateMany({
        where: { id: parent.id, totpBackupCodes: prevCodes },
        data: { totpBackupCodes: JSON.stringify(remaining) },
      });
      if (consumed.count !== 1) {
        recordLoginFailure(lockKey);
        return Response.json({ twoFactor: true, error: "Code de vérification invalide." }, { status: 401 });
      }
    }
  }

  await clearLoginFailures(lockKey);
  const token = await signSession({ parentId: parent.id, email: parent.email, tokenVersion: parent.tokenVersion });
  await setSessionCookie(token);
  await audit(parent.id, "login", undefined, ip);

  // token is also returned for non-browser clients (mobile app)
  return json({ id: parent.id, name: parent.name, email: parent.email, token });
}
