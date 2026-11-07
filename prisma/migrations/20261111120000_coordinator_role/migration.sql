-- AlterTable
ALTER TABLE `Project` ADD COLUMN `createdById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` MODIFY `role` ENUM('ADMIN', 'COORDINATOR', 'MEMBER') NOT NULL DEFAULT 'MEMBER';

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Miembros que hoy son PM de algún proyecto pasan a Coordinador
UPDATE `User` SET `role` = 'COORDINATOR' WHERE `role` = 'MEMBER' AND `deletedAt` IS NULL AND `id` IN (SELECT `pmId` FROM `Project`);
