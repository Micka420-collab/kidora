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
    const sevParam = url.searchParams.get("severity");
    const severity = sevParam === "critical" || sevParam === "warning" ? sevParam : undefined;
    const cursor = url.searchParams.get("cursor"); // alert id to page after
    const scope = accessibleAlertWhere(parent.id); // owner OR co-guardian of the child
    // Stable order (ts, then id) so a cursor can't skip/duplicate rows that share
    // a timestamp (a whole sync's alerts default to the same ts). take PAGE+1 to
    // detect whether an older page exists, so history past 100 stays reachable.
    const rows = await prisma.alert.findMany({
      where: { ...scope, ...(unreadOnly ? { read: false } : {}), ...(severity ? { severity } : {}) },
      orderBy: [{ ts: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { child: { select: { name: true, avatar: true } } },
    });
    const hasMore = rows.length > PAGE;
    const alerts = hasMore ? rows.slice(0, PAGE) : rows;
    const nextCursor = hasMore ? alerts[alerts.length - 1].id : null;
    // TRUE totals per bucket (not just the loaded page) so the filter chips and
    // "N critical" can't undercount when the list is paginated/filtered.
    const [all, unread, critical, warning] = await Promise.all([
      prisma.alert.count({ where: scope }),
      prisma.alert.count({ where: { ...scope, read: false } }),
      prisma.alert.count({ where: { ...scope, severity: "critical" } }),
      prisma.alert.count({ where: { ...scope, severity: "warning" } }),
    ]);
    return json({ alerts, unread, nextCursor, counts: { all, unread, critical, warning } });
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
