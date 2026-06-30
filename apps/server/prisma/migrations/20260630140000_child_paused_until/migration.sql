-- AlterTable: timed pause (auto-resume after this instant)
ALTER TABLE "Child" ADD COLUMN "pausedUntil" DATETIME;
