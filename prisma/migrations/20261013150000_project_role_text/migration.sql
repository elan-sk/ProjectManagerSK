-- El rol por proyecto pasa a texto largo (hasta 1000 caracteres, con saltos de línea).
ALTER TABLE `ProjectRole` MODIFY `role` TEXT NOT NULL;
