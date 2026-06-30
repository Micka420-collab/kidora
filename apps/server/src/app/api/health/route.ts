import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/health — public liveness/readiness probe. Confirms the DB is
// reachable and reports round-trip latency, without leaking business metrics.
export async function GET() {
  const t0 = Date.now();
  try {
    await prisma.parent.count(); // cheap DB round-trip
    return json({
      status: "ok",
      version: "1.0.0",
      db: "up",
      latencyMs: Date.now() - t0,
    });
  } catch {
    return json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
