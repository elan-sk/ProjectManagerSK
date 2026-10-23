ALTER TABLE `ReviewCheckEvidence` ADD COLUMN `isResponse` BOOLEAN NOT NULL DEFAULT false;

-- Las evidencias que ya existen no guardan quién las subió: es respuesta del responsable lo que se
-- subió después de que una ronda de la tarea quedó devuelta y antes de que se reenviara.
UPDATE `ReviewCheckEvidence` e
JOIN `ReviewCheck` c ON c.`id` = e.`reviewCheckId`
JOIN `ReviewRound` cr ON cr.`id` = c.`reviewRoundId`
JOIN `ReviewRound` r ON r.`taskId` = cr.`taskId` AND r.`outcome` = 'RETURNED' AND r.`closedAt` IS NOT NULL AND e.`uploadedAt` > r.`closedAt`
LEFT JOIN `ReviewRound` n ON n.`taskId` = r.`taskId` AND n.`roundNumber` = r.`roundNumber` + 1
SET e.`isResponse` = true
WHERE n.`id` IS NULL OR e.`uploadedAt` < n.`submittedAt`;
