import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { buildChildReport } from "@/lib/report";

type Ctx = { params: Promise<{ childId: string }> };

// GET /api/children/:id/report?days=7
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 7), 1), 31);
    return json(await buildChildReport(childId, days));
  });
}
