-- AlterTable: family local-time offset (minutes to add to UTC), reported by the
-- agent so the server buckets the screen-time day / bonus / "today" in local time.
ALTER TABLE "Child" ADD COLUMN "tzOffsetMinutes" INTEGER NOT NULL DEFAULT 0;
