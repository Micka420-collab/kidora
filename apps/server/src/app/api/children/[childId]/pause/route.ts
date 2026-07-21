import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, readJson } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { clampPauseMinutes } from "@/lib/pause";
import { buildCommandRows } from "@/lib/commands";

type Ctx = { params: Promise<{ childId: string }> };

// POST /api/children/:id/pause
//   body: { paused: boolean }      → indefinite pause / resume
//   body: { untilMinutes: number } → timed pause (auto-resumes after N minutes)
export async function POST(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const body = (await readJson<{ paused?: boolean; untilMinutes?: number }>(req)) ?? {};
    const minutes = clampPauseMinutes(body.untilMinutes);

    let data: { paused: boolean; pausedUntil: Date | null };
    let pausing: boolean;
    if (minutes) {
      data = { paused: false, pausedUntil: new Date(Date.now() + minutes * 60_000) };
      pausing = true;
    } else {
      const child = await prisma.child.findUnique({ where: { id: childId }, select: { paused: true } });
      const paused = body.paused ?? !child!.paused;
      data = { paused, pausedUntil: null };
      pausing = paused;
    }

    const updated = await prisma.child.update({
      where: { id: childId },
      data,
      select: { paused: true, pausedUntil: true },
    });

    // Queue a command for the agents to apply instantly — fanned out to EVERY
    // device: a single null-device row is consumed by whichever device syncs
    // first, leaving the child's other devices paused/locked forever.
    const deviceIds = (await prisma.device.findMany({ where: { childId }, select: { id: true } })).map((d) => d.id);
    await prisma.command.createMany({
      data: buildCommandRows({
        childId,
        type: pausing ? "pause" : "resume",
        payload: JSON.stringify({ reason: "manual", until: data.pausedUntil?.toISOString() ?? null }),
        deviceIds,
      }),
    });

    return json({ paused: updated.paused, pausedUntil: updated.pausedUntil });
  });
}
