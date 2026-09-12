-- Punto 2: CHECKLIST y MEETING dejaron de ser tipos de tarea — las tareas
-- existentes con esos valores pasan a SIMPLE (checklist y link de reunión
-- ahora son atributos de cualquier tipo, no se pierden datos: TaskStep y el
-- futuro meetingUrl siguen intactos).
UPDATE "Task" SET "type" = 'SIMPLE' WHERE "type" IN ('CHECKLIST', 'MEETING');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "meetingUrl" TEXT;

-- CreateTable
CREATE TABLE "AdjustmentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "note" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdjustmentItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdjustmentAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adjustmentItemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdjustmentAttachment_adjustmentItemId_fkey" FOREIGN KEY ("adjustmentItemId") REFERENCES "AdjustmentItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdjustmentAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
