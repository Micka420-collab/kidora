import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, clampLimit } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";

type Ctx = { params: Promise<{ childId: string }> };

// GET /api/children/:id/messages — SMS/chat sent & received, newest first.
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const take = clampLimit(new URL(req.url).searchParams.get("take"), 100, 300);
    const messages = await prisma.message.findMany({
      where: { childId },
      orderBy: { ts: "desc" },
      take,
    });
    return json({ messages });
  });
}
