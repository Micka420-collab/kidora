// Self-host cron scheduler. On Vercel the cron jobs in vercel.json fire the
// /api/cron/* routes; a self-hoster running `next start` gets nothing, so
// retention, offline-checks and weekly reports never run. This starts an
// in-process scheduler (from instrumentation.ts) that hits those same routes on
// an interval — only when NOT on Vercel and only with a CRON_SECRET to authorize.

export type SchedulerEnv = {
  runtime?: string; // NEXT_RUNTIME
  isVercel?: boolean; // process.env.VERCEL
  secret?: string; // CRON_SECRET
};

/** Decide whether the in-process scheduler should run, with a reason for logs. */
export function schedulerDecision(env: SchedulerEnv): { run: boolean; reason: string } {
  if (env.runtime && env.runtime !== "nodejs") return { run: false, reason: "not the Node.js runtime" };
  if (env.isVercel) return { run: false, reason: "on Vercel (Vercel Cron handles scheduling)" };
  if (!env.secret) return { run: false, reason: "CRON_SECRET not set (crons are fail-closed)" };
  return { run: true, reason: "self-host: scheduling enabled" };
}

/** Build an authorized cron URL. */
export function buildCronUrl(base: string, path: string, secret: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${base.replace(/\/$/, "")}${path}${sep}key=${encodeURIComponent(secret)}`;
}

const HOUR = 3_600_000;

// The plan: [path, everyMs, initialDelayMs]. Reports run daily but are internally
// idempotent (weekly guard via Parent.lastWeeklyReportAt), so a daily poll only
// sends when due.
export const CRON_PLAN: [string, number, number][] = [
  ["/api/cron/offline-check", HOUR, 60_000],
  ["/api/cron/cleanup", 24 * HOUR, 5 * 60_000],
  ["/api/cron/reports", 24 * HOUR, 10 * 60_000],
];

let started = false;

/** Start the scheduler (idempotent). Safe no-op when it shouldn't run. */
export function startSelfHostScheduler(
  env: SchedulerEnv = {
    runtime: process.env.NEXT_RUNTIME,
    isVercel: !!process.env.VERCEL,
    secret: process.env.CRON_SECRET,
  },
): boolean {
  if (started) return false;
  const decision = schedulerDecision(env);
  if (!decision.run) {
    if (!env.isVercel) console.log(`[scheduler] disabled — ${decision.reason}`);
    return false;
  }
  started = true;
  const secret = env.secret as string;
  const port = process.env.PORT || "3000";
  const base = `http://127.0.0.1:${port}`;

  const hit = async (path: string) => {
    try {
      const res = await fetch(buildCronUrl(base, path, secret));
      console.log(`[scheduler] ${path} -> ${res.status}`);
    } catch (e) {
      console.warn(`[scheduler] ${path} failed: ${(e as Error).message}`);
    }
  };

  for (const [path, every, initial] of CRON_PLAN) {
    setTimeout(() => {
      hit(path);
      setInterval(() => hit(path), every);
    }, initial).unref?.();
  }
  console.log("[scheduler] self-host cron scheduler active");
  return true;
}
