-- CreateTable
CREATE TABLE `GroupAlertItem` (
    `id` VARCHAR(191) NOT NULL,
    `groupJid` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `mentionUserIds` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,

    INDEX `GroupAlertItem_sentAt_groupJid_idx`(`sentAt`, `groupJid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
