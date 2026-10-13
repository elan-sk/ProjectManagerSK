-- AlterTable: cargo general de la persona (informativo, no da permisos).
ALTER TABLE `User` ADD COLUMN `cargo` VARCHAR(191) NULL;

-- CreateTable: rol de una persona dentro de un proyecto puntual.
CREATE TABLE `ProjectRole` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectRole_projectId_idx`(`projectId`),
    INDEX `ProjectRole_userId_idx`(`userId`),
    UNIQUE INDEX `ProjectRole_projectId_userId_key`(`projectId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectRole` ADD CONSTRAINT `ProjectRole_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectRole` ADD CONSTRAINT `ProjectRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;