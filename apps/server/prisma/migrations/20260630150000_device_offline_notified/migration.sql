-- AlterTable: track whether a "device offline" alert was already sent this outage
ALTER TABLE "Device" ADD COLUMN "offlineNotified" BOOLEAN NOT NULL DEFAULT false;
