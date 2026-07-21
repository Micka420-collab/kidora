-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "resetAt" BIGINT NOT NULL
);

-- CreateTable
CREATE TABLE "LoginFailure" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "lastAt" BIGINT NOT NULL,
    "lockedUntil" BIGINT NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- CreateIndex
CREATE INDEX "LoginFailure_lastAt_idx" ON "LoginFailure"("lastAt");
