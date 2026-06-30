import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ childId: string }> };

function today() {
  return new Date().toISOString().slice(0, 10);
}

// GET: pending/recent requests + today's bonus total
export async function GET(_req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const [requests, grants] = await Promise.all([
      prisma.timeRequest.findMany({ where: { childId }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.timeGrant.findMany({ where: { childId, date: today() } }),
    ]);
    return json({
      requests,
      bonusMinutesToday: grants.reduce((a, g) => a + g.minutes, 0),
    });
  });
}

const postSchema = z.object({ minutes: z.number().int().min(5).max(480) });

// POST: parent grants bonus minutes directly for today
export async function POST(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const parsed = postSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);

    await prisma.timeGrant.create({
      data: { childId, date: today(), minutes: parsed.data.minutes, source: "parent" },
    });
    // lift a manual pause/limit lock implicitly by resuming
    await prisma.command.create({ data: { childId, type: "resume", payload: "{}" } });
    await audit(parent.id, "time.grant", `+${parsed.data.minutes} min`);
    return json({ ok: true, granted: parsed.data.minutes });
  });
}

const patchSchema = z.object({
  id: z.string(),
  action: z.enum(["approve", "deny"]),
});

// PATCH: approve/deny a child's request
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);

    const reqRow = await prisma.timeRequest.findFirst({
      where: { id: parsed.data.id, childId },
    });
    if (!reqRow) return apiError("Demande introuvable", 404);
    // Idempotent: an already-handled request must not grant time again.
    if (reqRow.status !== "pending") {
      return json({ ok: true, alreadyProcessed: true, status: reqRow.status });
    }

    if (parsed.data.action === "approve") {
      // Atomically claim the request (only if still pending) to defend against
      // a double-click / two-tab race that would otherwise double-grant time.
      const claimed = await prisma.timeRequest.updateMany({
        where: { id: reqRow.id, status: "pending" },
        data: { status: "approved" },
      });
      if (claimed.count === 0) return json({ ok: true, alreadyProcessed: true });
      await prisma.$transaction([
        prisma.timeGrant.create({
          data: { childId, date: today(), minutes: reqRow.minutes, source: "request" },
        }),
        prisma.command.create({ data: { childId, type: "resume", payload: "{}" } }),
      ]);
    } else {
      await prisma.timeRequest.updateMany({
        where: { id: reqRow.id, status: "pending" },
        data: { status: "denied" },
      });
    }
    return json({ ok: true });
  });
}
