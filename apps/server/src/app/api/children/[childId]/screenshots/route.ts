import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, clampLimit } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { decrypt } from "@/lib/crypto";

type Ctx = { params: Promise<{ childId: string }> };

// GET /api/children/:id/screenshots?limit=12
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const limit = clampLimit(new URL(req.url).searchParams.get("limit"), 12, 20);
    const rows = await prisma.screenshot.findMany({
      where: { childId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const screenshots = rows.map((s) => ({ ...s, dataUrl: decrypt(s.dataUrl) }));
    return json({ screenshots });
  });
}
