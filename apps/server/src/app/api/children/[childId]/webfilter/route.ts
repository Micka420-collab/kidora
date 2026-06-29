import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";

type Ctx = { params: Promise<{ childId: string }> };

const putSchema = z.object({
  safeSearch: z.boolean().optional(),
  blockUnknown: z.boolean().optional(),
  blockedCategories: z.array(z.string()).optional(),
});

export async function PUT(req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const parsed = putSchema.safeParse(await readJson(req));
    if (!parsed.success) return apiError("Données invalides", 422);

    const cfg = await prisma.webFilterConfig.upsert({
      where: { childId },
      create: {
        childId,
        safeSearch: parsed.data.safeSearch ?? true,
        blockUnknown: parsed.data.blockUnknown ?? false,
        blockedCategories: JSON.stringify(parsed.data.blockedCategories ?? []),
      },
      update: {
        ...(parsed.data.safeSearch !== undefined && { safeSearch: parsed.data.safeSearch }),
        ...(parsed.data.blockUnknown !== undefined && { blockUnknown: parsed.data.blockUnknown }),
        ...(parsed.data.blockedCategories !== undefined && {
          blockedCategories: JSON.stringify(parsed.data.blockedCategories),
        }),
      },
    });
    return json({ webFilter: cfg });
  });
}
