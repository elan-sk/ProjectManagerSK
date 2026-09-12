-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SIMPLE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "meetingUrl" TEXT,
    "meetingAt" DATETIME,
    "meetingReminderSentAt" DATETIME,
    "plannedStart" DATETIME NOT NULL,
    "plannedEnd" DATETIME NOT NULL,
    "actualStart" DATETIME,
    "actualEnd" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "defaultTestTemplateId" TEXT,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_defaultTestTemplateId_fkey" FOREIGN KEY ("defaultTestTemplateId") REFERENCES "TestTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("actualEnd", "actualStart", "createdAt", "description", "id", "meetingAt", "meetingReminderSentAt", "meetingUrl", "phaseId", "plannedEnd", "plannedStart", "projectId", "riskLevel", "status", "title", "type") SELECT "actualEnd", "actualStart", "createdAt", "description", "id", "meetingAt", "meetingReminderSentAt", "meetingUrl", "phaseId", "plannedEnd", "plannedStart", "projectId", "riskLevel", "status", "title", "type" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
