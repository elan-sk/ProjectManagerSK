-- Reemplaza el borrado real de un proyecto/usuario por archivar/desactivar
-- (ver prisma/schema.prisma) — un borrado en cascada sobre un proyecto o
-- usuario con historial real bloqueaba toda la app en el hosting compartido.
ALTER TABLE `Project` MODIFY `status` ENUM('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'PLANNING';

ALTER TABLE `User` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true;
