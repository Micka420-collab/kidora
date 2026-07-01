-- AlterTable: per-parent AI (OpenRouter) config for LLM-based risk detection.
-- The API key is stored encrypted at rest (see lib/crypto).
ALTER TABLE "Parent" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Parent" ADD COLUMN "aiApiKey" TEXT;
ALTER TABLE "Parent" ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT '';
