-- CreateTable
CREATE TABLE "WatchedVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "deviceId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'youtube',
    "platform" TEXT NOT NULL DEFAULT 'pc',
    "title" TEXT NOT NULL,
    "channel" TEXT,
    "url" TEXT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchedVideo_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "deviceId" TEXT,
    "app" TEXT NOT NULL DEFAULT 'sms',
    "direction" TEXT NOT NULL,
    "contact" TEXT,
    "body" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WatchedVideo_childId_ts_idx" ON "WatchedVideo"("childId", "ts");

-- CreateIndex
CREATE INDEX "Message_childId_ts_idx" ON "Message"("childId", "ts");
