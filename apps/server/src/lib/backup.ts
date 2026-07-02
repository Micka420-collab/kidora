// Automatic database backup for self-host (SQLite). Uses SQLite's atomic
// `VACUUM INTO`, which writes a consistent snapshot even while the app is
// running — no file-copy race. Rotated to keep the newest N. On Postgres this
// is a no-op (use your managed provider's backups). Wired to /api/cron/backup
// and the self-host scheduler.
import { mkdirSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";

const PREFIX = "kidora-";
const SUFFIX = ".db";

/** Two-digit pad. */
const p2 = (n: number) => String(n).padStart(2, "0");

/** Sortable backup filename: kidora-YYYYMMDD-HHMMSS.db (local time). */
export function backupFileName(now: Date = new Date()): string {
  const d = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}`;
  const t = `${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
  return `${PREFIX}${d}-${t}${SUFFIX}`;
}

/** Does a filename look like one of our backups? */
export function isBackupName(name: string): boolean {
  return name.startsWith(PREFIX) && name.endsWith(SUFFIX);
}

/**
 * Given existing backup filenames, return which to DELETE to keep only the
 * newest `keep`. Names sort chronologically (timestamp is in the name). Pure.
 */
export function pruneBackups(names: string[], keep: number): string[] {
  const sorted = names.filter(isBackupName).sort(); // ascending = oldest first
  if (keep <= 0) return sorted;
  return sorted.slice(0, Math.max(0, sorted.length - keep));
}

type PrismaLike = { $executeRawUnsafe: (sql: string) => Promise<unknown> };

/**
 * Run a database backup. SQLite → VACUUM INTO a rotated file. Non-SQLite →
 * skipped with a reason. Returns a summary.
 */
export async function runDatabaseBackup(
  prisma: PrismaLike,
  opts: { dir: string; keep?: number; databaseUrl?: string; now?: Date } = { dir: "backups" },
): Promise<{ skipped: boolean; reason?: string; file?: string; bytes?: number; pruned?: number }> {
  const url = opts.databaseUrl ?? process.env.DATABASE_URL ?? "file:./dev.db";
  if (!url.startsWith("file:")) {
    return { skipped: true, reason: "base non-SQLite — utilisez les sauvegardes managées de votre fournisseur Postgres" };
  }
  const dir = opts.dir;
  const keep = opts.keep ?? 7;
  mkdirSync(dir, { recursive: true });

  const name = backupFileName(opts.now);
  const dest = join(dir, name);
  // SQLite wants forward slashes and doubled single-quotes in the path literal.
  const literal = dest.replace(/\\/g, "/").replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${literal}'`);

  const toDelete = pruneBackups(readdirSync(dir), keep);
  for (const f of toDelete) {
    try {
      unlinkSync(join(dir, f));
    } catch {
      /* best-effort */
    }
  }

  let bytes = 0;
  try {
    bytes = statSync(dest).size;
  } catch {
    /* ignore */
  }
  return { skipped: false, file: name, bytes, pruned: toDelete.length };
}
