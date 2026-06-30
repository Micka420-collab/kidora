import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, clampLimit } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";

type Ctx = { params: Promise<{ childId: string }> };

function localDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// GET /api/children/:id/usage?date=YYYY-MM-DD&days=7
export async function GET(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const url = new URL(req.url);
    // clampLimit guards NaN/negative (?days=abc no longer yields an empty trend).
    const days = clampLimit(url.searchParams.get("days"), 7, 31);

    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(localDate(d));
    }

    const rows = await prisma.appUsage.findMany({
      where: { childId, date: { in: dates } },
    });

    // by app (today) and by day (trend)
    const today = localDate();
    const byApp = new Map<string, { appId: string; appName: string; category: string | null; seconds: number }>();
    const byDay = new Map<string, number>(dates.map((d) => [d, 0]));

    for (const r of rows) {
      byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.seconds);
      if (r.date === today) {
        const cur = byApp.get(r.appId) ?? {
          appId: r.appId,
          appName: r.appName,
          category: r.category,
          seconds: 0,
        };
        cur.seconds += r.seconds;
        byApp.set(r.appId, cur);
      }
    }

    return json({
      today,
      totalTodaySeconds: byApp.size ? [...byApp.values()].reduce((a, b) => a + b.seconds, 0) : 0,
      byApp: [...byApp.values()].sort((a, b) => b.seconds - a.seconds),
      trend: dates.map((d) => ({ date: d, seconds: byDay.get(d) ?? 0 })),
    });
  });
}
