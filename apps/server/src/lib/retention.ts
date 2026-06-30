import type { PrismaClient } from "@/generated/prisma/client";

export const DEFAULT_RETENTION_DAYS = 90;
const MIN_DAYS = 7;
const MAX_DAYS = 3650; // 10 years

/** Parse & clamp a retention-days value (env or query). Pure. */
export function retentionDays(raw: string | number | undefined | null): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.trunc(n)));
}

/** The cutoff instant: rows older than this are eligible for deletion. Pure. */
export function cutoffDate(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** YYYY-MM-DD for comparing against AppUsage.date (stored as a string). Pure. */
export function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * High-volume telemetry tables and the timestamp column to prune on. Low-volume
 * history (alerts, time requests/grants, audit) is intentionally kept.
 */
type Purgeable = { table: string; deleted: number };

/**
 * Delete (or, when dryRun, count) telemetry rows older than `cutoff`.
 * Returns per-table counts. The DB work is isolated here; the cutoff math above
 * is pure and unit-tested.
 */
export async function purgeOldTelemetry(
  prisma: PrismaClient,
  cutoff: Date,
  opts: { dryRun?: boolean } = {},
): Promise<Purgeable[]> {
  const dry = opts.dryRun ?? false;
  const tsWhere = { ts: { lt: cutoff } };
  const results: Purgeable[] = [];

  const run = async (table: string, count: () => Promise<number>, del: () => Promise<{ count: number }>) => {
    results.push({ table, deleted: dry ? await count() : (await del()).count });
  };

  await run("activityEvent",
    () => prisma.activityEvent.count({ where: tsWhere }),
    () => prisma.activityEvent.deleteMany({ where: tsWhere }));
  await run("webVisit",
    () => prisma.webVisit.count({ where: tsWhere }),
    () => prisma.webVisit.deleteMany({ where: tsWhere }));
  await run("locationPing",
    () => prisma.locationPing.count({ where: tsWhere }),
    () => prisma.locationPing.deleteMany({ where: tsWhere }));
  await run("message",
    () => prisma.message.count({ where: tsWhere }),
    () => prisma.message.deleteMany({ where: tsWhere }));
  await run("watchedVideo",
    () => prisma.watchedVideo.count({ where: tsWhere }),
    () => prisma.watchedVideo.deleteMany({ where: tsWhere }));
  await run("screenshot",
    () => prisma.screenshot.count({ where: { createdAt: { lt: cutoff } } }),
    () => prisma.screenshot.deleteMany({ where: { createdAt: { lt: cutoff } } }));
  // AppUsage.date is a YYYY-MM-DD string → lexicographic comparison is correct.
  const dateWhere = { date: { lt: ymd(cutoff) } };
  await run("appUsage",
    () => prisma.appUsage.count({ where: dateWhere }),
    () => prisma.appUsage.deleteMany({ where: dateWhere }));

  // Old *read* alerts (unread are always kept) and old handled commands.
  const readAlertWhere = { read: true, ts: { lt: cutoff } };
  await run("alertRead",
    () => prisma.alert.count({ where: readAlertWhere }),
    () => prisma.alert.deleteMany({ where: readAlertWhere }));
  const doneCmdWhere = { status: { not: "pending" }, createdAt: { lt: cutoff } };
  await run("commandDone",
    () => prisma.command.count({ where: doneCmdWhere }),
    () => prisma.command.deleteMany({ where: doneCmdWhere }));

  return results;
}
