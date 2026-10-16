-- Recupera el uso anterior desde el historial de chat que aún existe: una pregunta = un mensaje de la
-- persona que no es un resultado de herramienta. Es un mínimo (lo que alguien limpió ya no está).
INSERT INTO `BotUsage` (`userId`, `questions`, `lastUsedAt`)
SELECT `userId`, COUNT(*), MAX(`createdAt`)
FROM `BotMessage`
WHERE `role` = 'user' AND `content` NOT LIKE '%"type":"tool_result"%'
GROUP BY `userId`
ON DUPLICATE KEY UPDATE `questions` = `BotUsage`.`questions`;
