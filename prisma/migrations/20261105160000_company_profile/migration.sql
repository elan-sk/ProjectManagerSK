-- AlterTable
ALTER TABLE `AppSetting` ADD COLUMN `companyAssistantFocus` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `CompanyProfileTopic` (
    `key` VARCHAR(40) NOT NULL,
    `text` TEXT NULL,
    `skipped` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` VARCHAR(191) NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanyDocument` (
    `id` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `addedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanyTaskTypeMeaning` (
    `type` ENUM('SIMPLE', 'MILESTONE', 'QA', 'ADJUSTMENT', 'ACCEPTANCE') NOT NULL,
    `meaning` TEXT NULL,
    `unused` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

