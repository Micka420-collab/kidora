import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";
import { requireParent, requireOwnedChild, withGuard } from "@/lib/guard";

type Ctx = { params: Promise<{ childId: string }> };

// GET /api/children/:id/live — real-time snapshot for the "live" card.
export async function GET(_req: NextRequest, ctx: Ctx) {
  return withGuard(async () => {
    const parent = await requireParent();
    const { childId } = await ctx.params;
    await requireOwnedChild(parent.id, childId);

    const [devices, lastApp, lastLoc, child] = await Promise.all([
      prisma.device.findMany({ where: { childId } }),
      prisma.activityEvent.findFirst({
        where: { childId, type: "app_open" },
        orderBy: { ts: "desc" },
        include: { device: { select: { name: true } } },
      }),
      prisma.locationPing.findFirst({ where: { childId }, orderBy: { ts: "desc" } }),
      prisma.child.findUnique({ where: { id: childId }, select: { paused: true } }),
    ]);

    // "online" if any device reported in the last 2 minutes
    const now = Date.now();
    const onlineDevice = devices.find(
      (d) => d.online && d.lastSeen && now - d.lastSeen.getTime() < 2 * 60_000,
    );
    const lastSeen = devices
      .map((d) => d.lastSeen?.getTime() ?? 0)
      .reduce((a, b) => Math.max(a, b), 0);

    // current app only counts if seen recently (last 5 min)
    const currentApp =
      lastApp && now - lastApp.ts.getTime() < 5 * 60_000
        ? { title: lastApp.title, device: lastApp.device.name, ts: lastApp.ts }
        : null;

    return json({
      online: !!onlineDevice,
      paused: child?.paused ?? false,
      lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
      battery: onlineDevice?.battery ?? devices[0]?.battery ?? null,
      deviceName: onlineDevice?.name ?? null,
      currentApp,
      location: lastLoc
        ? { lat: lastLoc.lat, lng: lastLoc.lng, address: lastLoc.address, ts: lastLoc.ts }
        : null,
    });
  });
}
