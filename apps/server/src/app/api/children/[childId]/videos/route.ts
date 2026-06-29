import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";

type Ctx = { params: Promise<{ childId: string }> };

// GET /api/children/:id/videos — watched videos (YouTube titles), newest first.
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const take = Math.min(Math.max(Number(new URL(req.url).searchParams.get("take") ?? 100), 1), 300);
    const videos = await prisma.watchedVideo.findMany({
      where: { childId },
      orderBy: { ts: "desc" },
      take,
    });
    return json({ videos });
  });
}
