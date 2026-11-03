-- CreateTable
CREATE TABLE `ReviewCheckFailure` (
    `id` VARCHAR(191) NOT NULL,
    `reviewRoundId` VARCHAR(191) NOT NULL,
    `checkId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NULL,
    `responseCategory` TEXT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReviewCheckFailure_reviewRoundId_idx`(`reviewRoundId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ReviewCheckFailure` ADD CONSTRAINT `ReviewCheckFailure_reviewRoundId_fkey` FOREIGN KEY (`reviewRoundId`) REFERENCES `ReviewRound`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Recupera el historial perdido: una prueba que pasó a otra ronda tras una devolución
-- falló en la ronda anterior. Se reconoce por la nota anterior o por una captura del
-- revisor subida antes de la ronda actual (la captura es obligatoria al marcar «Con errores»).
-- Una prueba que falló varias veces se recupera una sola vez.
INSERT INTO `ReviewCheckFailure` (`id`, `reviewRoundId`, `checkId`, `category`, `responseCategory`, `note`, `createdAt`)
SELECT REPLACE(UUID(), '-', ''), prev.`id`, c.`id`, c.`category`, c.`responseCategory`, c.`previousNote`, COALESCE(prev.`closedAt`, cur.`submittedAt`)
FROM `ReviewCheck` c
JOIN `ReviewRound` cur ON cur.`id` = c.`reviewRoundId`
JOIN `ReviewRound` prev ON prev.`taskId` = cur.`taskId` AND prev.`roundNumber` = cur.`roundNumber` - 1 AND prev.`outcome` = 'RETURNED'
WHERE c.`previousNote` IS NOT NULL
   OR EXISTS (
     SELECT 1 FROM `ReviewCheckEvidence` e
     WHERE e.`reviewCheckId` = c.`id` AND e.`isResponse` = 0 AND e.`uploadedAt` < cur.`submittedAt`
   );
