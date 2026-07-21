import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { isAllowedPushEndpoint } from "@/lib/push";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export async function POST(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Abonnement invalide", 422);
    const { endpoint, keys } = parsed.data;
    // The endpoint is later POSTed to by the server; only accept real push
    // services so it can't be pointed at internal infra (SSRF).
    if (!isAllowedPushEndpoint(endpoint)) return apiError("Endpoint de push non autorisé", 422);
    await prisma.pushSub.upsert({
      where: { endpoint },
      create: { parentId: parent.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { parentId: parent.id, p256dh: keys.p256dh, auth: keys.auth },
    });
    return json({ ok: true });
  });
}
