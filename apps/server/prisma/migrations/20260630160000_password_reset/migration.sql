-- AlterTable: password-reset token
ALTER TABLE "Parent" ADD COLUMN "resetToken" TEXT;
ALTER TABLE "Parent" ADD COLUMN "resetTokenExpiry" DATETIME;
CREATE UNIQUE INDEX "Parent_resetToken_key" ON "Parent"("resetToken");
