-- AlterTable
ALTER TABLE `Project` ADD COLUMN `parentId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Objective` ADD COLUMN `parentObjectiveId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Objective` ADD CONSTRAINT `Objective_parentObjectiveId_fkey` FOREIGN KEY (`parentObjectiveId`) REFERENCES `Objective`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
