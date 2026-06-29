import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, readJson } from "@/lib/http";
import { requireParent, withGuard, accessibleChildWhere } from "@/lib/guard";
import { audit } from "@/lib/audit";

// POST /api/family/pause { paused: boolean } — pause/resume ALL accessible children at once
export async function POST(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const body = (await readJson<{ paused?: boolean }>(req)) ?? {};
    const paused = body.paused ?? true;

    const children = await prisma.child.findMany({
      where: accessibleChildWhere(parent.id),
      select: { id: true },
    });
    const ids = children.map((c) => c.id);
    if (ids.length === 0) return json({ paused, count: 0 });

    await prisma.child.updateMany({ where: { id: { in: ids } }, data: { paused } });
    await prisma.command.createMany({
      data: ids.map((childId) => ({
        childId,
        type: paused ? "pause" : "resume",
        payload: JSON.stringify({ reason: "family" }),
      })),
    });
    await audit(parent.id, paused ? "family.pause" : "family.resume", `${ids.length} enfant(s)`);
    return json({ paused, count: ids.length });
  });
}
