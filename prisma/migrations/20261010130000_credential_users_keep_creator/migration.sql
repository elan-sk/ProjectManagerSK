-- «Personas concretas»: desde ahora quien la crea solo la ve si está marcado. Para que nadie pierda
-- el acceso que ya tenía, se marca al creador en las contraseñas de ese tipo que existen hoy.
INSERT IGNORE INTO `CredentialUser` (`credentialId`, `userId`)
SELECT `id`, `createdById` FROM `Credential` WHERE `visibility` = 'USERS' AND `createdById` IS NOT NULL;
