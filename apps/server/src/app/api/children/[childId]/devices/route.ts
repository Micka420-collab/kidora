import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";
import { randomToken } from "@/lib/password";

type Ctx = { params: Promise<{ childId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);
    const devices = await prisma.device.findMany({
      where: { childId },
      orderBy: { createdAt: "asc" },
    });
    return json({ devices });
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  platform: z.enum(["windows", "android", "ios", "macos"]),
  model: z.string().optional(),
});

// POST creates a device and returns the enrollToken the agent needs.
export async function POST(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const parsed = createSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);

    const device = await prisma.device.create({
      data: {
        childId,
        name: parsed.data.name,
        platform: parsed.data.platform,
        model: parsed.data.model,
        enrollToken: randomToken(24),
      },
    });
    return json({ device });
  });
}
