-- AlterTable
ALTER TABLE `AppSetting` ADD COLUMN `botProvider` VARCHAR(191) NOT NULL DEFAULT 'anthropic',
    ADD COLUMN `botBaseUrl` VARCHAR(191) NULL,
    ADD COLUMN `botModel` VARCHAR(191) NULL;
