-- CreateTable
CREATE TABLE `Learning` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `personId` VARCHAR(191) NULL,
    `topic` VARCHAR(191) NOT NULL,
    `title` TEXT NOT NULL,
    `evidence` TEXT NOT NULL,
    `recommendation` TEXT NOT NULL,
    `status` ENUM('PROPOSED', 'APPLIED', 'DISCARDED') NOT NULL DEFAULT 'PROPOSED',
    `cutoff` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'app',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Learning_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearningPrompt` (
    `key` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Learning` ADD CONSTRAINT `Learning_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Learning` ADD CONSTRAINT `Learning_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
