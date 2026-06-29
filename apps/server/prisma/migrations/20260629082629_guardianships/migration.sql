-- CreateTable
CREATE TABLE "Guardianship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'guardian',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Guardianship_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Guardianship_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Guardianship_parentId_idx" ON "Guardianship"("parentId");

-- CreateIndex
CREATE INDEX "Guardianship_childId_idx" ON "Guardianship"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "Guardianship_parentId_childId_key" ON "Guardianship"("parentId", "childId");
