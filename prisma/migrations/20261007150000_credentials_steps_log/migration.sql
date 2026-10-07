-- CreateTable
CREATE TABLE `CredentialStep` (
    `credentialId` VARCHAR(191) NOT NULL,
    `stepId` VARCHAR(191) NOT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`credentialId`, `stepId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CredentialAdjustmentItem` (
    `credentialId` VARCHAR(191) NOT NULL,
    `adjustmentItemId` VARCHAR(191) NOT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`credentialId`, `adjustmentItemId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CredentialAccessLog` (
    `id` VARCHAR(191) NOT NULL,
    `credentialId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NOT NULL,
    `event` ENUM('VIEW', 'REVEAL', 'COPY_URL', 'COPY_USERNAME', 'COPY_PASSWORD') NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'app',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CredentialAccessLog_credentialId_createdAt_idx`(`credentialId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CredentialStep` ADD CONSTRAINT `CredentialStep_credentialId_fkey` FOREIGN KEY (`credentialId`) REFERENCES `Credential`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialStep` ADD CONSTRAINT `CredentialStep_stepId_fkey` FOREIGN KEY (`stepId`) REFERENCES `TaskStep`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialAdjustmentItem` ADD CONSTRAINT `CredentialAdjustmentItem_credentialId_fkey` FOREIGN KEY (`credentialId`) REFERENCES `Credential`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialAdjustmentItem` ADD CONSTRAINT `CredentialAdjustmentItem_adjustmentItemId_fkey` FOREIGN KEY (`adjustmentItemId`) REFERENCES `AdjustmentItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialAccessLog` ADD CONSTRAINT `CredentialAccessLog_credentialId_fkey` FOREIGN KEY (`credentialId`) REFERENCES `Credential`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialAccessLog` ADD CONSTRAINT `CredentialAccessLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

