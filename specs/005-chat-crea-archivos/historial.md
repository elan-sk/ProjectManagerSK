# Historial — 005 El chat crea archivos

- 2026-10-09 — Pedido por chat con captura: el chat responde que no puede crear un .docx.
- 2026-10-09 — Fuentes leídas: `MEMORY.md`, `docs/constitution.md`, `src/lib/chontatecTools.ts`, `src/lib/chontatec.ts`, `src/lib/uploadFile.ts`, `src/lib/persistentUploads.ts`, `src/lib/botFilePrep.ts`, `src/components/FileViewer.tsx`, `src/components/AttachmentPreviewModal.tsx`, `src/app/uploads/[name]/route.ts`, `src/app/(app)/ChontatecWidget.tsx`.
- 2026-10-09 — Biblioteca Depura: barrido del índice por stack y palabras clave; nada aplicable (solo #736, exportador a Excel en PHP para WordPress).
- 2026-10-09 — Viabilidad: `exceljs`, `jszip` y `marked` ya instalados; faltan librerías para Word (`docx` 9.9.0), PowerPoint (`pptxgenjs` 4.0.1) y PDF (`pdfkit` 0.20.2 o `pdfmake` 0.3.11, a decidir en el plan). Límite real: 4.096 tokens por turno y 50 segundos por respuesta (`LOOP_BUDGET_MS`), unas 2 a 3 páginas por archivo.
- 2026-10-09 — Entrevista, ronda 1: formatos = Word, Excel, texto, PDF, HTML y PowerPoint; motor de Word = librería `docx`.
- 2026-10-09 — Entrevista, ronda 2: se acepta el límite de tamaño; encabezado simple; todos los miembros (HTML solo administradores y PM).
- 2026-10-09 — Spec escrita en borrador; pendiente la aprobación 1.
- 2026-10-09 — Aprobación 1: spec aprobada sin cambios. La sugerencia del botón «Adjuntar a una tarea» no se incluyó.
- 2026-10-09 — Documentación consultada (Context7): pdfkit (`doc.table`, `bufferPages`), pptxgenjs (`write({ outputType: "nodebuffer" })`, `addTable`), docx (encabezado, pie con `PageNumber.CURRENT`, viñetas, tablas, `Packer.toBuffer`). PDF con pdfkit.
- 2026-10-09 — Plan escrito; pendiente la aprobación 2.
- 2026-10-09 — Aprobación 2: plan aprobado («dale, crea el paquete»): implementar y armar el paquete de deploy.
- 2026-10-09 — T1 a T6 hechas. Archivos: `src/lib/botFileCreate.ts` (nuevo), `src/lib/chontatecTools.ts` (`create_file`, `isAdminOrPm`), `src/lib/chontatec.ts` (regla «Archivos», respuesta cortada), `src/lib/botOpenAI.ts` (`max_tokens`), `next.config.ts`, `package.json`, `scripts/verify-bot-create-file.ts` (nuevo), `scripts/verify-bot-openai.ts`.
- 2026-10-09 — T7: `npx tsc --noEmit` sin errores; `verify:bot-create-file`, `verify:bot-openai`, `verify:bot-history`, `verify:bot-file-prep` y `verify:file-dedup` OK. `npm run lint`: 11 errores y 7 avisos, los mismos que antes del cambio (comparado con stash); los archivos tocados no agregan ninguno.
- 2026-10-09 — Revisión visual sin navegador: muestras de Word, PowerPoint y Excel abiertas con LibreOffice y convertidas a imagen, y el PDF directo: encabezado, tablas, listas, acentos y numeración correctos. Guardado real probado con `saveUploadedFile` para cada formato (HTML rechazado sin permiso) y archivos de prueba borrados.
- 2026-10-09 — Sin probar: el chat en el navegador con un servicio de IA real (RF-1, RF-3, RF-4, RF-6, RF-14) y la apertura en Microsoft Word, Excel y PowerPoint.
