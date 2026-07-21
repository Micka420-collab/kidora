-- AlterTable: deadline after which a NEVER-USED enroll token stops working
-- (cleared on first successful enrollment; NULL = no expiry for legacy rows).
ALTER TABLE "Device" ADD COLUMN "enrollTokenExpiresAt" DATETIME;
