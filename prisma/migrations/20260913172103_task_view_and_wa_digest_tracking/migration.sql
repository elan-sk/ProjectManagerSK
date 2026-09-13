-- AlterTable
ALTER TABLE `TaskAssignee` ADD COLUMN `viewedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `lastDigestSentAt` DATETIME(3) NULL;
