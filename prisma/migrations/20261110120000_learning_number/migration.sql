-- AlterTable
ALTER TABLE `Learning` ADD COLUMN `number` INTEGER NOT NULL AUTO_INCREMENT,
    ADD UNIQUE INDEX `Learning_number_key`(`number`);
