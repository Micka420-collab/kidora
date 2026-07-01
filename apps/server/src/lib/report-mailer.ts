import { prisma } from "./prisma";
import { buildChildReport } from "./report";
import { sendMail, isMailConfigured } from "./mailer";
import { renderWeeklyEmail, hasActivity, type ReportItem } from "./report-email";

export type WeeklyRunSummary = {
  configured: boolean;
  candidates: number;
  sent: number;
  skippedNoActivity: number;
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
    select: { id: true, name: true, email: true },
  });

  const summary: WeeklyRunSummary = {
    configured,
    candidates: parents.length,
    sent: 0,
    skippedNoActivity: 0,
    errors: 0,
    dryRun,
  };

  for (const parent of parents) {
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

    try {
      const { subject, html, text } = renderWeeklyEmail(parent.name, items, days);
      await sendMail({ to: parent.email, subject, html, text });
      summary.sent++;
    } catch {
      summary.errors++;
    }
  }

  return summary;
}
