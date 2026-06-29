import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { audit } from "@/lib/audit";

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

    const command = await prisma.command.create({
      data: {
        childId,
        deviceId: parsed.data.deviceId ?? null,
        type: parsed.data.type,
        payload: JSON.stringify(parsed.data.payload ?? {}),
      },
    });
    await audit(parent.id, "command", `${parsed.data.type}`);
    return json({ command });
  });
}
