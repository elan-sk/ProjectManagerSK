-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `credentialId` VARCHAR(191) NULL,
    MODIFY `type` ENUM('ASSIGNED', 'DEADLINE_APPROACHING', 'OVERDUE', 'BLOCKED', 'DELAY_CAUSED', 'RETURNED', 'REVIEW_REQUESTED', 'LATE_START', 'LATE_START_CRITICAL', 'SHARE_ACTIVITY', 'MENTION', 'URGENT_TASK', 'SYSTEM', 'CREDENTIAL_SHARED') NOT NULL;

-- CreateTable
CREATE TABLE `Credential` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `url` TEXT NULL,
    `username` VARCHAR(191) NULL,
    `passwordEnc` TEXT NOT NULL,
    `notes` TEXT NULL,
    `visibility` ENUM('ALL', 'PROJECT', 'USERS') NOT NULL DEFAULT 'PROJECT',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CredentialUser` (
    `credentialId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`credentialId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CredentialTask` (
    `credentialId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`credentialId`, `taskId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_credentialId_fkey` FOREIGN KEY (`credentialId`) REFERENCES `Credential`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Credential` ADD CONSTRAINT `Credential_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Credential` ADD CONSTRAINT `Credential_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialUser` ADD CONSTRAINT `CredentialUser_credentialId_fkey` FOREIGN KEY (`credentialId`) REFERENCES `Credential`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialUser` ADD CONSTRAINT `CredentialUser_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialTask` ADD CONSTRAINT `CredentialTask_credentialId_fkey` FOREIGN KEY (`credentialId`) REFERENCES `Credential`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CredentialTask` ADD CONSTRAINT `CredentialTask_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

