import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";

type Ctx = { params: Promise<{ childId: string }> };

// GET /api/children/:id/activity?limit=100&type=web_visit
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
    const type = url.searchParams.get("type") ?? undefined;

    const events = await prisma.activityEvent.findMany({
      where: { childId, ...(type ? { type } : {}) },
      orderBy: { ts: "desc" },
      take: limit,
      include: { device: { select: { name: true, platform: true } } },
    });
    return json({ events });
  });
}
