-- AlterTable: per-alert-type notification preferences (JSON array of muted types)
ALTER TABLE "Parent" ADD COLUMN "alertPrefs" TEXT NOT NULL DEFAULT '[]';
