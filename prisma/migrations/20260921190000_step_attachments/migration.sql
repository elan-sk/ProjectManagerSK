-- AlterTable
ALTER TABLE `Attachment` ADD COLUMN `stepId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_stepId_fkey` FOREIGN KEY (`stepId`) REFERENCES `TaskStep`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
