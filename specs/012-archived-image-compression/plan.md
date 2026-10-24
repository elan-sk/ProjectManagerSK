# Plan 012 — Compresión de imágenes de proyectos archivados

Diagrama: [change-diagram.png](change-diagram.png)

## Inventario de impacto

| Consumidor | Estado |
|---|---|
| `setProjectArchived` (pantalla `ArchiveToggleButton`, API `PATCH /api/v1/projects/:id`) | ✅ lanza el proceso al archivar (RF-1) |
| `archiveProject` = Eliminar (pantalla, API `DELETE`, bot `chontatecTools`) | ✅ lanza el proceso (RF-2) |
| `instrumentation.ts` (arranque) | ✅ corre una vez (RF-8) |
| Adjuntos de tarea, proyecto, ajuste, entregables, evidencias, mensajes de revisión | ✅ dirección, `fileName` y `mimeType` (RF-6) |
| Ícono de proyecto | ✅ dirección (RF-6) |
| Textos con imágenes pegadas (descripciones, comentarios, mensajes, criterios) | ✅ dirección (RF-6) |
| Notificaciones, mensajes del bot, alertas de grupo, cola de WhatsApp | ✅ dirección; uso neutro (RF-6) |
| Foto de usuario y foto del bot | ✅ protegen la imagen (RF-3) |
| `.md`/`.html`/`.txt` subidos | ✅ protegen la imagen (RF-3) |
| Ruta `/uploads/[name]` | ➖ ya sirve `.webp` con su tipo |
| Visor HTML `api/html/[name]` | ➖ sirve los HTML, que no se tocan |
| WhatsApp (`whatsapp.ts`), foto del bot (`botSettings`), bot (`chontatecTools`) | ➖ leen por la dirección guardada, que ya queda actualizada |
| Respaldo completo `backup/full` | ➖ copia lo que hay en disco |
| `fileCleanup` (borrado al quitar un adjunto) | ➖ sigue igual; si nadie usa el WebP, lo borra |
| `unifyUploads` | ✅ se extrae su reescritura para reutilizarla, sin cambiar lo que hace |
| Galería de medios, buscador, listas, reportes, permisos | ➖ muestran la dirección guardada; no hay lógica por formato |

## Archivos

- `src/lib/fileReferences.ts` — se agregan `FILE_ROW_MODELS` (las 6 tablas de adjuntos con `fileName`/`mimeType`) y `UPLOAD_URL`. RF-6.
- `src/lib/unifyUploads.ts` — se extrae el paso 3 (reescritura) a `rewriteUploadReferences(mapping)` exportada; `unifyUploads` la llama igual que antes. RF-6.
- `src/lib/archivedImageCompression.ts` (nuevo) — `compressArchivedImages()` y `scheduleArchivedImageCompression()`. RF-1 a RF-5, RF-7, RF-10 a RF-12.
- `src/app/(app)/projects/[id]/taskOps.ts` — `setProjectArchived` llama a `scheduleArchivedImageCompression()` cuando `archived` es true. RF-1, RF-9.
- `src/app/(app)/projects/[id]/actions.ts` — `archiveProject` lo llama al eliminar. RF-2.
- `src/instrumentation.ts` — lo llama al arrancar, en segundo plano, después de `unifyUploads`. RF-8.
- `scripts/verify-archived-image-compression.ts` + `verify:archived-image-compression` en `package.json`.

## Reutiliza

- `EXACT_REFS`, `TEXT_REFS`, `table`, `countFileReferences` (fileReferences.ts).
- Reescritura de direcciones de `unifyUploads.ts` (se extrae, no se copia).
- `contentFileName`, `uploadWriteDir`, `findUploadPath`, `sharp` (ya instalado).
- Patrón «uno a la vez» de `unifyUploads` (`running`) más una marca de pendiente.

Se construye desde cero: la clasificación por proyecto (no existe nada que diga a qué proyecto pertenece un uso).

## Lógica

```
schedule(): si running → pending = true; si no → run().catch(log)
run(): running = true; do { pending = false; compress() } while (pending); running = false

compress():
  estado de cada proyecto: activo | archivado (archivedAt) | eliminado (status ARCHIVED)
  mapas tarea→proyecto, ronda→tarea, prueba→ronda, mensaje de revisión→ronda, ítem de ajuste→tarea, paso→tarea
  por cada tabla de EXACT_REFS y TEXT_REFS: dueño = proyecto | "protege" | "neutro"
  por cada dirección /uploads/*.png|jpg|jpeg: conjunto de estados de sus dueños
  .md/.html/.txt de la carpeta de subidas: toda dirección que aparezca → protegida
  candidata = sin "protege", sin "activo" y con al menos un archivado/eliminado
    con archivado → sharp().rotate().resize(2560, 2560, inside, sin agrandar).webp(80)
        si pesa menos: escribir <huella>.webp (si no existe) y mapping viejo→nuevo
    solo eliminados → lista de borrado
  rewriteUploadReferences(mapping) + fileName/mimeType en FILE_ROW_MODELS
  original comprimido: si countFileReferences(viejo) == 0 y está en uploadWriteDir → unlink
  solo eliminados: unlink si está en uploadWriteDir
  cada imagen en su try/catch → log y sigue; al final, resumen en el log
```

## Decisiones

- Segundo plano con promesa suelta + `.catch` (igual que `unifyUploads`), no `after()` de Next: el bot elimina proyectos fuera de una petición web, donde `after()` falla.
- Se recalcula todo en cada corrida (no solo el proyecto archivado): una imagen puede liberarse cuando se archiva el último proyecto activo que la usaba. Recorre las tablas completas, como ya hace `countFileReferences`.
- Borrado de imágenes de proyectos eliminados con referencias en esos proyectos: excepción explícita a la constitución (principio 5), pedida por el usuario; las referencias que quedan son de proyectos que la app ya no muestra.
- Solo se borra lo que está en la carpeta de escritura; las copias viejas de otras versiones se dejan (igual que `unifyUploads`).

## Verificación

- `npx tsc --noEmit`, `npm run lint`, `npm run verify:file-dedup` (la reescritura extraída sigue funcionando).
- `verify:archived-image-compression` con datos temporales en la base local y archivos temporales: proyecto activo + archivado + eliminado, imagen compartida, imagen en `.md`, foto de usuario, SVG, y WebP que no achica. Comprueba RF-1 a RF-7, RF-12.
- Corrida real en local al arrancar `npx next dev`: resumen en el log.
