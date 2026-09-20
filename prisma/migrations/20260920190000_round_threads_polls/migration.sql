-- AlterTable
ALTER TABLE `ShareComment` ADD COLUMN `reviewCheckId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `SharePoll` ADD COLUMN `reviewMessageId` VARCHAR(191) NULL,
    MODIFY `commentId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ReviewMessageAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `reviewMessageId` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `SharePoll_reviewMessageId_key` ON `SharePoll`(`reviewMessageId`);

-- AddForeignKey
ALTER TABLE `ShareComment` ADD CONSTRAINT `ShareComment_reviewCheckId_fkey` FOREIGN KEY (`reviewCheckId`) REFERENCES `ReviewCheck`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SharePoll` ADD CONSTRAINT `SharePoll_reviewMessageId_fkey` FOREIGN KEY (`reviewMessageId`) REFERENCES `ReviewMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewMessageAttachment` ADD CONSTRAINT `ReviewMessageAttachment_reviewMessageId_fkey` FOREIGN KEY (`reviewMessageId`) REFERENCES `ReviewMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

