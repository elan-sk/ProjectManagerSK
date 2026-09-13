-- CreateTable
CREATE TABLE "BotMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BotMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryCode" TEXT NOT NULL DEFAULT 'CO',
    "whatsappGroupJid" TEXT,
    "workHoursStart" INTEGER NOT NULL DEFAULT 8,
    "workHoursEnd" INTEGER NOT NULL DEFAULT 18,
    "botName" TEXT NOT NULL DEFAULT 'Chontatec',
    "botAvatarUrl" TEXT,
    "botApiKey" TEXT,
    "botMonthlyQuestionLimit" INTEGER NOT NULL DEFAULT 300,
    "botQuestionsUsedThisPeriod" INTEGER NOT NULL DEFAULT 0,
    "botUsagePeriodStart" DATETIME
);
INSERT INTO "new_AppSetting" ("countryCode", "id", "whatsappGroupJid", "workHoursEnd", "workHoursStart") SELECT "countryCode", "id", "whatsappGroupJid", "workHoursEnd", "workHoursStart" FROM "AppSetting";
DROP TABLE "AppSetting";
ALTER TABLE "new_AppSetting" RENAME TO "AppSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BotMessage_userId_createdAt_idx" ON "BotMessage"("userId", "createdAt");
