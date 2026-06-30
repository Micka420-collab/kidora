import { NextRequest } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { json, apiError, readJson } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { generateSecret, verifyTotp, otpauthURL } from "@/lib/totp";
import { encrypt, decrypt } from "@/lib/crypto";
import { generateBackupCodes, consumeBackupCode, parseBackupHashes } from "@/lib/backup-codes";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

const schema = z.object({
  action: z.enum(["enroll", "verify", "disable"]),
  code: z.string().optional(),
});

// GET /api/account/2fa — current 2FA status.
export async function GET() {
  return withGuard(async () => {
    const parent = await requireParent();
    return json({ enabled: parent.totpEnabled });
  });
}

// POST /api/account/2fa — { action: enroll | verify | disable, code? }
export async function POST(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();

    // Throttle code attempts: verify/disable check a 6-digit TOTP (window 1 ⇒
    // only 3/10^6 codes valid), so without a limit a hijacked session could
    // brute-force a code to disable 2FA. 10 attempts / 5 min per account.
    const rl = rateLimit(`2fa:${parent.id}`, 10, 5 * 60_000);
    if (!rl.ok) {
      return Response.json(
        { error: "Trop de tentatives. Réessayez plus tard." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);
    const { action, code } = parsed.data;

    if (action === "enroll") {
      // Refuse re-enrollment while 2FA is active: otherwise enroll would
      // overwrite the live secret and flip totpEnabled off with no code check,
      // silently neutralizing 2FA (the code-gated `disable` path is the only
      // way to turn it off). The UI only offers enroll when 2FA is disabled.
      if (parent.totpEnabled) {
        return apiError("La 2FA est déjà active. Désactivez-la d'abord pour la reconfigurer.", 400);
      }
      // Generate a fresh pending secret (2FA stays disabled until verified).
      // Stored encrypted at rest; the QR/otpauth still carries the plaintext.
      const secret = generateSecret();
      await prisma.parent.update({ where: { id: parent.id }, data: { totpSecret: encrypt(secret), totpEnabled: false } });
      const uri = otpauthURL(secret, parent.email);
      const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
      return json({ secret, otpauth: uri, qr });
    }

    if (action === "verify") {
      if (!parent.totpSecret) return apiError("Commencez par configurer la 2FA.", 400);
      if (!verifyTotp(decrypt(parent.totpSecret), code ?? "")) return apiError("Code invalide. Réessayez.", 401);
      // Issue one-time recovery codes (shown once) so a lost authenticator can't
      // lock the parent out. Stored as hashes; the plaintext is returned here only.
      const { codes, hashes } = generateBackupCodes(8);
      await prisma.parent.update({
        where: { id: parent.id },
        data: { totpEnabled: true, totpBackupCodes: JSON.stringify(hashes) },
      });
      await audit(parent.id, "2fa.enable");
      return json({ enabled: true, backupCodes: codes });
    }

    // disable — accept a current TOTP code OR a backup code (so a lost
    // authenticator can still turn 2FA off using a recovery code).
    if (!parent.totpEnabled) return json({ enabled: false });
    const totpOk = !!parent.totpSecret && verifyTotp(decrypt(parent.totpSecret), code ?? "");
    const backupOk = consumeBackupCode(code ?? "", parseBackupHashes(parent.totpBackupCodes)) !== null;
    if (!totpOk && !backupOk) {
      return apiError("Code invalide.", 401);
    }
    await prisma.parent.update({
      where: { id: parent.id },
      data: { totpEnabled: false, totpSecret: null, totpBackupCodes: "[]" },
    });
    await audit(parent.id, "2fa.disable");
    return json({ enabled: false });
  });
}
