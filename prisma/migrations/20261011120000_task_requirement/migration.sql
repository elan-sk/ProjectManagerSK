-- CreateTable
CREATE TABLE `_TaskRequirements` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_TaskRequirements_AB_unique`(`A`, `B`),
    INDEX `_TaskRequirements_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `_TaskRequirements` ADD CONSTRAINT `_TaskRequirements_A_fkey` FOREIGN KEY (`A`) REFERENCES `Requirement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_TaskRequirements` ADD CONSTRAINT `_TaskRequirements_B_fkey` FOREIGN KEY (`B`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill
INSERT IGNORE INTO `_TaskRequirements` (`A`, `B`)
SELECT pr.`B`, t.`id`
FROM `Task` t
JOIN `_PhaseRequirements` pr ON pr.`A` = t.`phaseId`
JOIN `Requirement` r ON r.`id` = pr.`B` AND r.`projectId` = t.`projectId`;
