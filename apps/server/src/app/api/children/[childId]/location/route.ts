import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, clampLimit } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";

type Ctx = { params: Promise<{ childId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const limit = clampLimit(new URL(req.url).searchParams.get("limit"), 50, 200);
    const pings = await prisma.locationPing.findMany({
      where: { childId },
      orderBy: { ts: "desc" },
      take: limit,
    });
    const geofences = await prisma.geofence.findMany({ where: { childId } });
    return json({ pings, latest: pings[0] ?? null, geofences });
  });
}
