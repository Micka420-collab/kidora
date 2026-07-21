import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { localDateString } from "@/lib/localdate";
import { buildCommandRows } from "@/lib/commands";

// "resume" must reach EVERY device of the child — a single null-device command
// is consumed by whichever device syncs first, leaving the others locked.
async function resumeCommandRows(childId: string) {
  const deviceIds = (await prisma.device.findMany({ where: { childId }, select: { id: true } })).map((d) => d.id);
  return buildCommandRows({ childId, type: "resume", payload: "{}", deviceIds });
}

type Ctx = { params: Promise<{ childId: string }> };

// "Today" in the family's local timezone, so a bonus granted in the evening
// lands on the day it's meant to offset (not the next UTC day).
function today(tzOffsetMinutes: number) {
  return localDateString(Date.now(), tzOffsetMinutes);
}

// GET: pending/recent requests + today's bonus total
export async function GET(_req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    const child = await requireOwnedChild(parent.id, childId);
    const [requests, grants] = await Promise.all([
      prisma.timeRequest.findMany({ where: { childId }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.timeGrant.findMany({ where: { childId, date: today(child.tzOffsetMinutes) } }),
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
    const child = await requireOwnedChild(parent.id, childId);
    const parsed = postSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);

    await prisma.timeGrant.create({
      data: { childId, date: today(child.tzOffsetMinutes), minutes: parsed.data.minutes, source: "parent" },
    });
    // lift a manual pause/limit lock implicitly by resuming (on every device)
    await prisma.command.createMany({ data: await resumeCommandRows(childId) });
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
    const child = await requireOwnedChild(parent.id, childId);
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
          data: { childId, date: today(child.tzOffsetMinutes), minutes: reqRow.minutes, source: "request" },
        }),
        prisma.command.createMany({ data: await resumeCommandRows(childId) }),
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
