import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/http";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runDatabaseBackup } from "@/lib/backup";

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

// GET /api/cron/backup — snapshot the SQLite database (VACUUM INTO) with rotation.
// No-op on Postgres (use the provider's managed backups). Run daily by the
// self-host scheduler; safe to call manually with ?key=<CRON_SECRET>.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return apiError("Unauthorized", 401);

  const dir = process.env.BACKUP_DIR || "backups";
  const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 7);
  try {
    const result = await runDatabaseBackup(prisma, { dir, keep });
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "backup failed" }, { status: 500 });
  }
}
