import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";

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
    await prisma.pushSub.upsert({
      where: { endpoint },
      create: { parentId: parent.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { parentId: parent.id, p256dh: keys.p256dh, auth: keys.auth },
    });
    return json({ ok: true });
  });
}
