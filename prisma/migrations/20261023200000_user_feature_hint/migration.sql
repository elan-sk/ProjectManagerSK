-- CreateTable
CREATE TABLE `UserFeatureHint` (
    `userId` VARCHAR(191) NOT NULL,
    `hintId` VARCHAR(100) NOT NULL,
    `seenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `hintId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserFeatureHint` ADD CONSTRAINT `UserFeatureHint_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

