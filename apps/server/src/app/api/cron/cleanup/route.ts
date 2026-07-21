import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/http";
import { isCronAuthorized } from "@/lib/cron-auth";
import { retentionDays, cutoffDate, purgeOldTelemetry, DEFAULT_RETENTION_DAYS } from "@/lib/retention";
import { purgeExpiredRateLimits } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const key = new URL(req.url).searchParams.get("key") ?? "";
  return isCronAuthorized({
    secret: process.env.CRON_SECRET,
    isProduction: process.env.NODE_ENV === "production",
    bearer,
    key,
  });
}

// GET /api/cron/cleanup?days=90&dryRun=1 — prune telemetry older than the
// retention window (env RETENTION_DAYS, default 90; ?days= overrides). Wired to
// a daily Vercel Cron (see vercel.json).
export async function GET(req: NextRequest) {
  if (!authorized(req)) return apiError("Unauthorized", 401);

  const url = new URL(req.url);
  const override = url.searchParams.get("days");
  const days = retentionDays(override ?? process.env.RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  const dryRun = ["1", "true"].includes((url.searchParams.get("dryRun") ?? "").toLowerCase());

  const cutoff = cutoffDate(days);
  const results = await purgeOldTelemetry(prisma, cutoff, { dryRun });
  const total = results.reduce((a, r) => a + r.deleted, 0);
  // Also drop expired rate-limit windows & stale lockout rows (tiny table,
  // but it only ever grows without this).
  const rateLimits = dryRun ? { rateLimits: 0, loginFailures: 0 } : await purgeExpiredRateLimits();

  return json({
    ok: true,
    dryRun,
    retentionDays: days,
    cutoff: cutoff.toISOString(),
    total,
    tables: results,
    rateLimits,
  });
}
