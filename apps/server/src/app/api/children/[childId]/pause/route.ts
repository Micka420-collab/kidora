import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, readJson } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";

type Ctx = { params: Promise<{ childId: string }> };

// POST /api/children/:id/pause  body: { paused: boolean }
export async function POST(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const body = (await readJson<{ paused?: boolean }>(req)) ?? {};
    const child = await prisma.child.findUnique({ where: { id: childId } });
    const paused = body.paused ?? !child!.paused;

    await prisma.child.update({ where: { id: childId }, data: { paused } });

    // queue a command for the agent to apply instantly
    await prisma.command.create({
      data: {
        childId,
        type: paused ? "pause" : "resume",
        payload: JSON.stringify({ reason: "manual" }),
      },
    });

    return json({ paused });
  });
}
