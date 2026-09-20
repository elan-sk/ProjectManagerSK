-- AlterTable
ALTER TABLE `AdjustmentItem` ADD COLUMN `clientApproval` BOOLEAN NULL,
    ADD COLUMN `clientApprovalAt` DATETIME(3) NULL,
    ADD COLUMN `clientApprovalBy` VARCHAR(191) NULL;
