-- AlterTable
ALTER TABLE `AppSetting` ADD COLUMN `botGroupMentionsEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `cloudAccessToken` TEXT NULL,
    ADD COLUMN `cloudAppSecret` TEXT NULL,
    ADD COLUMN `cloudLastError` TEXT NULL,
    ADD COLUMN `cloudPhoneNumberId` VARCHAR(191) NULL,
    ADD COLUMN `cloudTemplateLang` VARCHAR(191) NOT NULL DEFAULT 'es',
    ADD COLUMN `cloudTemplateName` VARCHAR(191) NULL,
    ADD COLUMN `cloudVerifyToken` VARCHAR(191) NULL,
    ADD COLUMN `whatsappConnection` VARCHAR(191) NOT NULL DEFAULT 'qr',
    ADD COLUMN `whatsappLimitWarnedPct` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `whatsappMonthlyLimit` INTEGER NOT NULL DEFAULT 1500,
    ADD COLUMN `whatsappPeriodStart` DATETIME(3) NULL,
    ADD COLUMN `whatsappSentThisPeriod` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `whatsappLastInboundAt` DATETIME(3) NULL;

