import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { randomToken } from "@/lib/password";
import { newEnrollTokenExpiry } from "@/lib/enroll-token";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ childId: string; deviceId: string }> };

// POST — issue a fresh enrollment token (typically after the old one expired).
// Refused once the device is enrolled: at that point the token is the agent's
// live credential and rotating it would silently disconnect the device.
export async function POST(_req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId, deviceId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const device = await prisma.device.findFirst({ where: { id: deviceId, childId } });
    if (!device) return apiError("Appareil introuvable", 404);
    if (device.enrolled) return apiError("Appareil déjà connecté — jeton non régénérable.", 409);

    const updated = await prisma.device.update({
      where: { id: device.id },
      data: { enrollToken: randomToken(24), enrollTokenExpiresAt: newEnrollTokenExpiry() },
    });
    await audit(parent.id, "device.token.regenerate", device.name);
    return json({ device: updated });
  });
}
