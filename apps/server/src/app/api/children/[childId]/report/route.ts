import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { buildChildReport, dateStr } from "@/lib/report";

type Ctx = { params: Promise<{ childId: string }> };

// GET /api/children/:id/report?days=7
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 7), 1), 31);
    const report = await buildChildReport(childId, days);

    // Total screen time over the *previous* equal-length window, for a delta.
    const prevAgg = await prisma.appUsage.aggregate({
      _sum: { seconds: true },
      where: { childId, date: { gte: dateStr(2 * days - 1), lt: dateStr(days - 1) } },
    });
    return json({ ...report, prevTotalSeconds: prevAgg._sum.seconds ?? 0 });
  });
}
