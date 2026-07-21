import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, readJson } from "@/lib/http";
import { requireParent, withGuard, accessibleChildWhere } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { clampPauseMinutes } from "@/lib/pause";
import { buildCommandRows } from "@/lib/commands";

// POST /api/family/pause — pause/resume ALL accessible children at once.
//   { paused: boolean }      → indefinite pause / resume
//   { untilMinutes: number } → timed family pause (auto-resumes)
export async function POST(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const body = (await readJson<{ paused?: boolean; untilMinutes?: number }>(req)) ?? {};
    const minutes = clampPauseMinutes(body.untilMinutes);

    let data: { paused: boolean; pausedUntil: Date | null };
    let pausing: boolean;
    if (minutes) {
      data = { paused: false, pausedUntil: new Date(Date.now() + minutes * 60_000) };
      pausing = true;
    } else {
      const paused = body.paused ?? true;
      data = { paused, pausedUntil: null }; // resume also clears any timed pause
      pausing = paused;
    }

    const children = await prisma.child.findMany({
      where: accessibleChildWhere(parent.id),
      select: { id: true },
    });
    const ids = children.map((c) => c.id);
    if (ids.length === 0) return json({ paused: data.paused, pausedUntil: data.pausedUntil, count: 0 });

    await prisma.child.updateMany({ where: { id: { in: ids } }, data });
    // Fan the pause/resume out to every device of every child — one null-device
    // row per child is consumed by a single device, leaving siblings locked.
    const devices = await prisma.device.findMany({ where: { childId: { in: ids } }, select: { id: true, childId: true } });
    const byChild = new Map<string, string[]>(ids.map((id) => [id, []]));
    for (const d of devices) byChild.get(d.childId)?.push(d.id);
    const payload = JSON.stringify({ reason: "family", until: data.pausedUntil?.toISOString() ?? null });
    await prisma.command.createMany({
      data: ids.flatMap((childId) =>
        buildCommandRows({ childId, type: pausing ? "pause" : "resume", payload, deviceIds: byChild.get(childId) ?? [] }),
      ),
    });
    await audit(parent.id, pausing ? "family.pause" : "family.resume", `${ids.length} enfant(s)`);
    return json({ paused: data.paused, pausedUntil: data.pausedUntil, count: ids.length });
  });
}
