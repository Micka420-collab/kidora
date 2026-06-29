import { NextRequest } from "next/server";
import { json, apiError } from "@/lib/http";
import { sendWeeklyReports } from "@/lib/report-mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET` when the
// CRON_SECRET env var is set. We accept that, or the same secret as `?key=`.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured: allow only outside production (local testing).
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const key = new URL(req.url).searchParams.get("key") ?? "";
  return bearer === secret || key === secret;
}

// GET /api/cron/reports?days=7&dryRun=1 — send the weekly usage email to
// opted-in parents. Wired to a weekly Vercel Cron (see vercel.json).
export async function GET(req: NextRequest) {
  if (!authorized(req)) return apiError("Unauthorized", 401);
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 7), 1), 31);
  const dryRun = ["1", "true"].includes((url.searchParams.get("dryRun") ?? "").toLowerCase());

  const summary = await sendWeeklyReports({ days, dryRun });
  return json({ ok: true, ...summary });
}

// Allow manual POST triggering too (same auth).
export async function POST(req: NextRequest) {
  return GET(req);
}
