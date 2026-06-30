-- AlterTable: one-time 2FA recovery codes (sha256 hashes; consumed on use).
ALTER TABLE "Parent" ADD COLUMN "totpBackupCodes" TEXT NOT NULL DEFAULT '[]';
