-- AlterTable
ALTER TABLE `ClaudeLink` ADD COLUMN `learningKey` VARCHAR(191) NULL,
    ADD COLUMN `learningIds` JSON NULL;

-- CreateIndex
CREATE INDEX `ClaudeLink_userId_learningKey_idx` ON `ClaudeLink`(`userId`, `learningKey`);
