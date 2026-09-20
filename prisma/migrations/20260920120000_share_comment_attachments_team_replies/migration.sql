-- AlterTable
ALTER TABLE `Attachment` ADD COLUMN `shareCommentId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ShareComment` ADD COLUMN `authorUserId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_shareCommentId_fkey` FOREIGN KEY (`shareCommentId`) REFERENCES `ShareComment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShareComment` ADD CONSTRAINT `ShareComment_authorUserId_fkey` FOREIGN KEY (`authorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

