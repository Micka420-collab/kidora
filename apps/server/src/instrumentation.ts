// Next.js instrumentation — runs once when the server process starts. Used to
// launch the self-host cron scheduler (a no-op on Vercel and on the Edge runtime;
// see lib/scheduler.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSelfHostScheduler } = await import("@/lib/scheduler");
  startSelfHostScheduler();
}
