-- AlterTable: per-account session version. Incrementing it invalidates every
-- existing JWT session (logout everywhere) — used on password reset/change.
ALTER TABLE "Parent" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
