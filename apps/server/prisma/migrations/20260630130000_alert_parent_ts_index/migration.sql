-- CreateIndex: speed up "recent alerts for parent" and weekly alert counts
CREATE INDEX "Alert_parentId_ts_idx" ON "Alert"("parentId", "ts");
