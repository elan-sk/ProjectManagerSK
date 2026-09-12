-- AlterTable
ALTER TABLE "Project" ADD COLUMN "whatsappGroupJid" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "meetingAt" DATETIME;
ALTER TABLE "Task" ADD COLUMN "meetingReminderSentAt" DATETIME;

-- CreateTable
CREATE TABLE "WhatsAppQueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "target" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryCode" TEXT NOT NULL DEFAULT 'CO',
    "whatsappGroupJid" TEXT,
    "workHoursStart" INTEGER NOT NULL DEFAULT 8,
    "workHoursEnd" INTEGER NOT NULL DEFAULT 18
);
INSERT INTO "new_AppSetting" ("countryCode", "id") SELECT "countryCode", "id" FROM "AppSetting";
DROP TABLE "AppSetting";
ALTER TABLE "new_AppSetting" RENAME TO "AppSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
