# Constitución — ProjectManagerSK

Principios innegociables. Toda spec (`specs/NNN-*/`) y todo cambio se revisan contra esta lista.

1. **Verificación**: todo cambio pasa `npx tsc --noEmit`, `npm run lint` y los `verify:*` del área que toca; lógica nueva deja un chequeo ejecutable en `scripts/verify-*.ts`.
2. **Reutilizar antes de construir**: se busca y reusa lo existente (helpers, componentes, acciones); si algo se construye desde cero, se dice.
3. **Permisos centralizados**: visibilidad con `canSeeProject` / `visibleProjectWhere` / `taskVisibleTo`; la API valida con el actor real (`trustedActor` / `resolveActor`). Nunca `role === "ADMIN"` a secas ni un actor recibido por parámetro.
4. **Inventario de impacto**: cada cambio de una entidad lista todos sus consumidores (incluidos WhatsApp, colas y tareas programadas) y aplica a todas las instancias de un tipo de elemento de la interfaz.
5. **Archivos subidos**: se escriben solo con `uploadWriteDir()` (carpeta permanente) y nada se borra si otra referencia lo usa.
6. **Producción**: migraciones dentro de `npm run build`; ninguna promesa sin `.catch` en tareas de fondo; build con webpack. Ningún error bloquea la app: se maneja y se muestra (pantallas `error.tsx`).
7. **Textos de la app**: tercera persona o impersonal, sin jerga técnica, sin `confirm()` / `alert()` nativos ni notas de desarrollo visibles.
8. **WhatsApp**: nunca mensajes de prueba a grupos reales ni envíos por iniciativa propia.
