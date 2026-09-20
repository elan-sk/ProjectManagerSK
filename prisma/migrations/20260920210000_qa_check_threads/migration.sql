-- Hilo interno por prueba (Prueba/QA): comentarios, menciones, imágenes y preguntas del equipo.

-- AlterTable
ALTER TABLE `InternalMessage` ADD COLUMN `reviewCheckId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `SharePoll` ADD COLUMN `internalMessageId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `InternalMessage_reviewCheckId_idx` ON `InternalMessage`(`reviewCheckId`);

-- CreateIndex
CREATE UNIQUE INDEX `SharePoll_internalMessageId_key` ON `SharePoll`(`internalMessageId`);

-- AddForeignKey
ALTER TABLE `InternalMessage` ADD CONSTRAINT `InternalMessage_reviewCheckId_fkey` FOREIGN KEY (`reviewCheckId`) REFERENCES `ReviewCheck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SharePoll` ADD CONSTRAINT `SharePoll_internalMessageId_fkey` FOREIGN KEY (`internalMessageId`) REFERENCES `InternalMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
