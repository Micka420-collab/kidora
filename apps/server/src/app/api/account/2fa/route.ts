import { NextRequest } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { json, apiError, readJson } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { generateSecret, verifyTotp, otpauthURL } from "@/lib/totp";
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
      const secret = generateSecret();
      await prisma.parent.update({ where: { id: parent.id }, data: { totpSecret: secret, totpEnabled: false } });
      const uri = otpauthURL(secret, parent.email);
      const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
      return json({ secret, otpauth: uri, qr });
    }

    if (action === "verify") {
      if (!parent.totpSecret) return apiError("Commencez par configurer la 2FA.", 400);
      if (!verifyTotp(parent.totpSecret, code ?? "")) return apiError("Code invalide. Réessayez.", 401);
      await prisma.parent.update({ where: { id: parent.id }, data: { totpEnabled: true } });
      await audit(parent.id, "2fa.enable");
      return json({ enabled: true });
    }

    // disable — require a valid current code to turn it off.
    if (!parent.totpEnabled) return json({ enabled: false });
    if (!parent.totpSecret || !verifyTotp(parent.totpSecret, code ?? "")) {
      return apiError("Code invalide.", 401);
    }
    await prisma.parent.update({ where: { id: parent.id }, data: { totpEnabled: false, totpSecret: null } });
    await audit(parent.id, "2fa.disable");
    return json({ enabled: false });
  });
}
