import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";

type Ctx = { params: Promise<{ childId: string }> };

// GET /api/children/:id/screenshots?limit=12
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 12), 20);
    const screenshots = await prisma.screenshot.findMany({
      where: { childId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return json({ screenshots });
  });
}
