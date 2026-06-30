-- AlterTable: give the email-verification token an expiry (mirrors resetTokenExpiry).
ALTER TABLE "Parent" ADD COLUMN "emailVerifyTokenExpiry" DATETIME;
