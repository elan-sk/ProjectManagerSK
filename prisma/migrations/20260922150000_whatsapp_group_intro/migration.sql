-- CreateTable
CREATE TABLE `WhatsAppGroupIntro` (
    `groupJid` VARCHAR(191) NOT NULL,
    `introducedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`groupJid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
