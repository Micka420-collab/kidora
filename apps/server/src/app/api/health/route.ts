import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";

// GET /api/health — lightweight liveness/readiness probe (public).
export async function GET() {
  try {
    const [parents, children, devices] = await Promise.all([
      prisma.parent.count(),
      prisma.child.count(),
      prisma.device.count(),
    ]);
    return json({
      status: "ok",
      version: "1.0.0",
      db: "up",
      counts: { parents, children, devices },
    });
  } catch {
    return json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
