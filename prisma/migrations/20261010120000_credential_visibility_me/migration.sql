-- AlterTable: nueva visibilidad «Solo yo» (ME), agregada al final para no reordenar las existentes.
ALTER TABLE `Credential` MODIFY `visibility` ENUM('ALL', 'PROJECT', 'USERS', 'ME') NOT NULL DEFAULT 'PROJECT';
