-- Pregunta de selección (única o múltiple) en un paso del checklist: el texto del paso ES el enunciado.

-- AlterTable
ALTER TABLE `SharePoll` ADD COLUMN `taskStepId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `SharePoll_taskStepId_key` ON `SharePoll`(`taskStepId`);

-- AddForeignKey
ALTER TABLE `SharePoll` ADD CONSTRAINT `SharePoll_taskStepId_fkey` FOREIGN KEY (`taskStepId`) REFERENCES `TaskStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
