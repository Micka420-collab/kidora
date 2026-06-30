-- AlterTable: email verification (existing accounts are grandfathered as verified)
ALTER TABLE "Parent" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Parent" ADD COLUMN "emailVerifyToken" TEXT;
UPDATE "Parent" SET "emailVerified" = true;
CREATE UNIQUE INDEX "Parent_emailVerifyToken_key" ON "Parent"("emailVerifyToken");
