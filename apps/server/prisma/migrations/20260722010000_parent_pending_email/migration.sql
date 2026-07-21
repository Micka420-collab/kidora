-- AlterTable: double opt-in on email change — the requested address parks here
-- and `email` only switches once the new mailbox confirms (anti squat/lockout).
ALTER TABLE "Parent" ADD COLUMN "pendingEmail" TEXT;
