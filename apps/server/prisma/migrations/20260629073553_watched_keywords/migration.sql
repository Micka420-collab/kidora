-- CreateTable
CREATE TABLE "WatchedKeyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchedKeyword_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WatchedKeyword_childId_idx" ON "WatchedKeyword"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchedKeyword_childId_term_key" ON "WatchedKeyword"("childId", "term");
