import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";

export async function GET(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const alerts = await prisma.alert.findMany({
      where: { parentId: parent.id, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { ts: "desc" },
      take: 100,
      include: { child: { select: { name: true, avatar: true } } },
    });
    const unread = await prisma.alert.count({
      where: { parentId: parent.id, read: false },
    });
    return json({ alerts, unread });
  });
}

const patchSchema = z.object({
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});

// Mark alerts as read
export async function PATCH(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);

    await prisma.alert.updateMany({
      where: {
        parentId: parent.id,
        ...(parsed.data.all ? {} : { id: { in: parsed.data.ids ?? [] } }),
      },
      data: { read: true },
    });
    return json({ ok: true });
  });
}
