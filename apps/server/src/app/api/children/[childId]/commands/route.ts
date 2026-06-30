import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { buildCommandRows } from "@/lib/commands";

type Ctx = { params: Promise<{ childId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const commands = await prisma.command.findMany({
      where: { childId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return json({ commands });
  });
}

const createSchema = z.object({
  type: z.enum(["lock", "unlock", "pause", "resume", "block_app", "message", "locate", "screenshot"]),
  deviceId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const parsed = createSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);

    // A broadcast (no deviceId) is fanned out to every enrolled device so the
    // action reaches them all, not just whichever device syncs first.
    const deviceIds = parsed.data.deviceId
      ? []
      : (await prisma.device.findMany({ where: { childId }, select: { id: true } })).map((d) => d.id);

    const rows = buildCommandRows({
      childId,
      type: parsed.data.type,
      payload: JSON.stringify(parsed.data.payload ?? {}),
      deviceId: parsed.data.deviceId ?? null,
      deviceIds,
    });
    await prisma.command.createMany({ data: rows });
    await audit(parent.id, "command", rows.length > 1 ? `${parsed.data.type}×${rows.length}` : parsed.data.type);
    return json({ ok: true, count: rows.length });
  });
}
