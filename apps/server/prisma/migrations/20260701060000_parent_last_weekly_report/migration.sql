-- AlterTable: track when a parent's weekly report email was last sent, so a
-- cron retry/overlap doesn't re-send the email or re-charge their LLM budget.
ALTER TABLE "Parent" ADD COLUMN "lastWeeklyReportAt" DATETIME;
