import { prisma } from "./prisma";
import { buildChildReport } from "./report";
import { sendMail, isMailConfigured } from "./mailer";
import { renderWeeklyEmail, hasActivity, type ReportItem } from "./report-email";
import { tryDecrypt } from "./crypto";
import { summarizeWeekWithLLM } from "./openrouter";
import { buildAiSummaryInput } from "./ai-summary-input";

export type WeeklyRunSummary = {
  configured: boolean;
  candidates: number;
  sent: number;
  skippedNoActivity: number;
  skippedAlreadySent: number;
  errors: number;
  dryRun: boolean;
};

/**
 * Build and send the weekly usage summary to every opted-in parent that has
 * activity. Safe to call when SMTP is unconfigured (returns configured:false and
 * counts who *would* be emailed without sending).
 */
export async function sendWeeklyReports(opts: { days?: number; dryRun?: boolean } = {}): Promise<WeeklyRunSummary> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 31);
  const dryRun = opts.dryRun ?? false;
  const configured = isMailConfigured();

  const parents = await prisma.parent.findMany({
    where: { weeklyReportEmail: true },
    select: { id: true, name: true, email: true, aiEnabled: true, aiModel: true, aiApiKey: true, lastWeeklyReportAt: true },
  });

  const summary: WeeklyRunSummary = {
    configured,
    candidates: parents.length,
    sent: 0,
    skippedNoActivity: 0,
    skippedAlreadySent: 0,
    errors: 0,
    dryRun,
  };

  // Idempotency: don't re-send (or re-charge the LLM) to a parent already sent
  // within this window, so a cron retry/overlap after a mid-run timeout resumes
  // instead of re-emailing everyone. A dry run never records a send, so it's
  // exempt from this skip.
  const resendCutoffMs = Date.now() - Math.floor(days * 0.9) * 86_400_000;

  for (const parent of parents) {
    // Already sent this window (real runs only) → skip before any report build /
    // LLM call, so a retry doesn't re-email or re-charge them.
    if (!dryRun && parent.lastWeeklyReportAt && parent.lastWeeklyReportAt.getTime() > resendCutoffMs) {
      summary.skippedAlreadySent++;
      continue;
    }
    const children = await prisma.child.findMany({
      where: { parentId: parent.id },
      select: { id: true, name: true, tzOffsetMinutes: true },
      orderBy: { createdAt: "asc" },
    });
    if (children.length === 0) {
      summary.skippedNoActivity++;
      continue;
    }

    const items: ReportItem[] = [];
    for (const child of children) {
      items.push({ childName: child.name, report: await buildChildReport(child.id, days, child.tzOffsetMinutes) });
    }
    if (!items.some((it) => hasActivity(it.report))) {
      summary.skippedNoActivity++;
      continue;
    }

    if (dryRun || !configured) {
      summary.sent++; // counted as "would send"
      continue;
    }

    // Atomically CLAIM this parent's send window BEFORE the LLM calls and the
    // email: two overlapping runs (cron retry + manual trigger) both passed the
    // cheap read-skip above with the same snapshot, and without a conditional
    // write they would each email — and re-charge the parent's LLM key. Only
    // one updateMany can win.
    const claimStamp = new Date();
    const claim = await prisma.parent.updateMany({
      where: {
        id: parent.id,
        OR: [{ lastWeeklyReportAt: null }, { lastWeeklyReportAt: { lte: new Date(resendCutoffMs) } }],
      },
      data: { lastWeeklyReportAt: claimStamp },
    });
    if (claim.count === 0) {
      summary.skippedAlreadySent++; // another run claimed this parent
      continue;
    }

    try {
      // Enhance the email with a warm per-child AI summary when the parent has
      // AI enabled — uses their own OpenRouter key, aggregate stats only, and
      // only for real sends (not dry runs) and children with activity.
      if (parent.aiEnabled && parent.aiApiKey && parent.aiModel) {
        // Fail-closed: an undecryptable key (DATA_ENC_KEY rotated) must not go
        // to OpenRouter as ciphertext — send the email without AI summaries.
        const key = tryDecrypt(parent.aiApiKey);
        for (const it of key ? items : []) {
          if (!hasActivity(it.report)) continue;
          const s = await summarizeWeekWithLLM(key!, parent.aiModel, buildAiSummaryInput(it.childName, it.report, days));
          if (s) it.aiSummary = s;
        }
      }
      const { subject, html, text } = renderWeeklyEmail(parent.name, items, days);
      await sendMail({ to: parent.email, subject, html, text });
      summary.sent++;
    } catch (e) {
      summary.errors++;
      // Log it — the cron caller only looks at the HTTP status, so a swallowed
      // error here would make a dead SMTP config look green forever.
      console.error(JSON.stringify({
        level: "error",
        msg: "weekly_report_send_failed",
        parentId: parent.id,
        error: e instanceof Error ? e.message : String(e),
        ts: new Date().toISOString(),
      }));
      // Release the claim (only if it's still ours) so a transient failure is
      // retried on the next run instead of being silenced for a whole week.
      await prisma.parent.updateMany({
        where: { id: parent.id, lastWeeklyReportAt: claimStamp },
        data: { lastWeeklyReportAt: parent.lastWeeklyReportAt },
      }).catch(() => {});
    }
  }

  if (summary.errors > 0) {
    console.error(JSON.stringify({ level: "error", msg: "weekly_report_run_errors", errors: summary.errors, sent: summary.sent, ts: new Date().toISOString() }));
  }
  return summary;
}
