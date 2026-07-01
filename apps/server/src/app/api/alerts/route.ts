import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard, accessibleAlertWhere } from "@/lib/guard";

const PAGE = 100;

export async function GET(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const cursor = url.searchParams.get("cursor"); // alert id to page after
    const scope = accessibleAlertWhere(parent.id); // owner OR co-guardian of the child
    // Stable order (ts, then id) so a cursor can't skip/duplicate rows that share
    // a timestamp (a whole sync's alerts default to the same ts). take PAGE+1 to
    // detect whether an older page exists, so history past 100 stays reachable.
    const rows = await prisma.alert.findMany({
      where: { ...scope, ...(unreadOnly ? { read: false } : {}) },
      orderBy: [{ ts: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { child: { select: { name: true, avatar: true } } },
    });
    const hasMore = rows.length > PAGE;
    const alerts = hasMore ? rows.slice(0, PAGE) : rows;
    const nextCursor = hasMore ? alerts[alerts.length - 1].id : null;
    const unread = await prisma.alert.count({
      where: { ...scope, read: false },
    });
    return json({ alerts, unread, nextCursor });
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
        ...accessibleAlertWhere(parent.id),
        ...(parsed.data.all ? {} : { id: { in: parsed.data.ids ?? [] } }),
      },
      data: { read: true },
    });
    return json({ ok: true });
  });
}
