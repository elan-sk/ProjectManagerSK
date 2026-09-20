-- CreateTable
CREATE TABLE `SharePoll` (
    `id` VARCHAR(191) NOT NULL,
    `commentId` VARCHAR(191) NOT NULL,
    `multiple` BOOLEAN NOT NULL DEFAULT false,
    `closed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SharePoll_commentId_key`(`commentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SharePollOption` (
    `id` VARCHAR(191) NOT NULL,
    `pollId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SharePollVote` (
    `id` VARCHAR(191) NOT NULL,
    `pollId` VARCHAR(191) NOT NULL,
    `optionId` VARCHAR(191) NOT NULL,
    `voterKey` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `externalName` VARCHAR(191) NULL,
    `externalRole` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SharePollVote_pollId_voterKey_idx`(`pollId`, `voterKey`),
    UNIQUE INDEX `SharePollVote_optionId_voterKey_key`(`optionId`, `voterKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SharePoll` ADD CONSTRAINT `SharePoll_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `ShareComment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SharePollOption` ADD CONSTRAINT `SharePollOption_pollId_fkey` FOREIGN KEY (`pollId`) REFERENCES `SharePoll`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SharePollVote` ADD CONSTRAINT `SharePollVote_pollId_fkey` FOREIGN KEY (`pollId`) REFERENCES `SharePoll`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SharePollVote` ADD CONSTRAINT `SharePollVote_optionId_fkey` FOREIGN KEY (`optionId`) REFERENCES `SharePollOption`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SharePollVote` ADD CONSTRAINT `SharePollVote_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

