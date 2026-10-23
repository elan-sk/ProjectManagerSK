ALTER TABLE `ReviewCheck` ADD COLUMN `previousNote` TEXT NULL;

-- Las pruebas reenviadas conservaban la nota de la ronda devuelta en `note`: pasa a historial y el campo queda libre.
UPDATE `ReviewCheck` c
JOIN `ReviewRound` r ON r.`id` = c.`reviewRoundId`
SET c.`previousNote` = c.`note`, c.`note` = NULL
WHERE c.`result` IS NULL AND c.`note` IS NOT NULL AND r.`roundNumber` > 1;
