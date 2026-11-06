-- CreateTable
CREATE TABLE `CompanyBrand` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'main',
    `logoUrl` VARCHAR(191) NULL,
    `logoPngUrl` VARCHAR(191) NULL,
    `iconUrl` VARCHAR(191) NULL,
    `iconPngUrl` VARCHAR(191) NULL,
    `primaryColor` VARCHAR(7) NULL,
    `secondaryColor` VARCHAR(7) NULL,
    `legalName` VARCHAR(191) NULL,
    `taxId` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

