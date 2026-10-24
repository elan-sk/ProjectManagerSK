# Historial 012

- 2026-10-24 — Pedido por chat. Cloudflare descartado (archivos en hosting propio). Entrevista: borrar original, aplicar a ya archivados al arrancar, máx. 2560 px, eliminados → borrar imágenes que solo usan, nombre .webp, revisar .md/.html.
- 2026-10-24 — Spec aprobada. Plan aprobado (con diagrama). Rama feat/archived-image-compression.
- Biblioteca depura: no aplica (conector caído en esta sesión).
- 2026-10-24 — T1: rewriteUploadReferences, UPLOAD_URL y FILE_ROW_MODELS quedaron en fileReferences.ts (no en unifyUploads.ts como decía el plan: es la fuente única de referencias). verify:file-dedup OK.
- 2026-10-24 — T2/T3: verify:archived-image-compression en rojo y luego OK (2 comprimidas, 1 borrada). Dos corridas iniciales no limpiaron por FK de fases: se borraron 6 proyectos __verify-aic-* y 12 archivos huérfanos de prueba; el script ahora borra archivos primero y tareas antes que proyectos.
- 2026-10-24 — T4: enganchado en setProjectArchived (solo al archivar), archiveProject (eliminar) e instrumentation (después de unifyUploads). tsc y eslint OK.
- 2026-10-24 — T5: simulación sobre la base local: 193 imágenes con uso, 0 candidatas (no hay proyectos archivados; los 2 eliminados no tienen imágenes). Arranque registró el resumen con 0 cambios.
- Límite conocido: en producción, persistentUploads copia al arrancar archivos de carpetas de versiones viejas; un original borrado podría volver a copiarse si su versión vieja aún existe (solo ocupa espacio, no rompe nada).
