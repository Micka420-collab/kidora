import { prisma } from "@/lib/prisma";
import { requireParent, withGuard } from "@/lib/guard";

// GET /api/account/export — full export of the parent's data (RGPD/portability)
export async function GET() {
  return withGuard(async () => {
    const parent = await requireParent();

    const children = await prisma.child.findMany({
      where: { parentId: parent.id },
      include: {
        devices: true,
        screenTime: true,
        webFilter: true,
        appRules: true,
        webRules: true,
        routines: true,
        geofences: true,
        watchedKeywords: true,
        appUsages: true,
        webVisits: true,
        locationPings: true,
        activityEvents: true,
        timeRequests: true,
        timeGrants: true,
      },
    });
    const alerts = await prisma.alert.findMany({ where: { parentId: parent.id } });
    const auditLogs = await prisma.auditLog.findMany({ where: { parentId: parent.id } });

    const data = {
      exportedAt: new Date().toISOString(),
      account: { id: parent.id, name: parent.name, email: parent.email, createdAt: parent.createdAt },
      children,
      alerts,
      auditLogs,
    };

    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="kidora-export.json"`,
      },
    });
  });
}
