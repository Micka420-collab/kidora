import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, readJson, apiError } from "@/lib/http";
import { requireParent, withGuard } from "@/lib/guard";
import { DEFAULT_BLOCKED_CATEGORIES } from "@/lib/categories";
import { audit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1).max(60),
  birthDate: z.string().optional(),
  avatar: z.string().optional(),
});

// GET /api/children — list all children for the parent (with summary)
export async function GET() {
  return withGuard(async () => {
    const parent = await requireParent();
    const children = await prisma.child.findMany({
      where: { parentId: parent.id },
      include: {
        devices: true,
        screenTime: true,
        _count: { select: { alerts: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return json({ children });
  });
}

// POST /api/children — create a child profile with sane defaults
export async function POST(req: NextRequest) {
  return withGuard(async () => {
    const parent = await requireParent();
    const body = await readJson(req);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("Données invalides", 422);

    const child = await prisma.child.create({
      data: {
        parentId: parent.id,
        name: parsed.data.name,
        avatar: parsed.data.avatar ?? "🧒",
        birthDate: parsed.data.birthDate
          ? new Date(parsed.data.birthDate)
          : null,
        screenTime: {
          create: {
            enabled: true,
            dailyLimits: JSON.stringify({
              mon: 120, tue: 120, wed: 120, thu: 120,
              fri: 180, sat: 240, sun: 240,
            }),
            bedtimes: JSON.stringify([
              { days: ["sun", "mon", "tue", "wed", "thu"], start: "21:00", end: "07:00" },
              { days: ["fri", "sat"], start: "22:30", end: "08:00" },
            ]),
          },
        },
        webFilter: {
          create: {
            safeSearch: true,
            blockUnknown: false,
            blockedCategories: JSON.stringify(DEFAULT_BLOCKED_CATEGORIES),
          },
        },
      },
      include: { screenTime: true, webFilter: true, devices: true },
    });

    await audit(parent.id, "child.create", child.name);
    return json({ child });
  });
}
