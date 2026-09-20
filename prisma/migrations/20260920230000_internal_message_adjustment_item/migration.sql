-- AlterTable
ALTER TABLE `InternalMessage` ADD COLUMN `adjustmentItemId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `InternalMessage` ADD CONSTRAINT `InternalMessage_adjustmentItemId_fkey` FOREIGN KEY (`adjustmentItemId`) REFERENCES `AdjustmentItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

