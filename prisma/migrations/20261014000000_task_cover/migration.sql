-- AlterTable
ALTER TABLE `Task` ADD COLUMN `coverAttachmentId` VARCHAR(191) NULL,
    ADD COLUMN `coverHidden` BOOLEAN NOT NULL DEFAULT false;

