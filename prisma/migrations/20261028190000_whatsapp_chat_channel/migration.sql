-- AlterTable
ALTER TABLE `BotMessage` ADD COLUMN `channel` VARCHAR(191) NOT NULL DEFAULT 'web';

-- CreateIndex
CREATE INDEX `BotMessage_userId_channel_createdAt_idx` ON `BotMessage`(`userId`, `channel`, `createdAt`);

-- AlterTable
ALTER TABLE `AppSetting` ADD COLUMN `botWhatsappChatEnabled` BOOLEAN NOT NULL DEFAULT false;
