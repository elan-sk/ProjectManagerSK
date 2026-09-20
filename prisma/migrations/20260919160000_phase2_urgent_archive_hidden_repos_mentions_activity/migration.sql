-- AlterTable
ALTER TABLE `InternalMessage` ADD COLUMN `editedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM('ASSIGNED', 'DEADLINE_APPROACHING', 'OVERDUE', 'BLOCKED', 'DELAY_CAUSED', 'RETURNED', 'REVIEW_REQUESTED', 'LATE_START', 'LATE_START_CRITICAL', 'SHARE_ACTIVITY', 'MENTION', 'URGENT_TASK') NOT NULL;

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `hidden` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Task` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `isUrgent` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `ProjectRepo` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InternalMessageMention` (
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `InternalMessageMention_userId_idx`(`userId`),
    PRIMARY KEY (`messageId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserActivityDay` (
    `userId` VARCHAR(191) NOT NULL,
    `day` DATE NOT NULL,
    `interactions` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`userId`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectRepo` ADD CONSTRAINT `ProjectRepo_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InternalMessageMention` ADD CONSTRAINT `InternalMessageMention_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `InternalMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InternalMessageMention` ADD CONSTRAINT `InternalMessageMention_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserActivityDay` ADD CONSTRAINT `UserActivityDay_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

