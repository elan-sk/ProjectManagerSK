-- AlterTable
ALTER TABLE `AdjustmentItem` ADD COLUMN `clientReviewOpen` BOOLEAN NOT NULL DEFAULT true;

-- Los ajustes que ya tenían calificación del cliente quedan cerrados: solo el
-- equipo los vuelve a habilitar.
UPDATE `AdjustmentItem` SET `clientReviewOpen` = false WHERE `clientApproval` IS NOT NULL;
