# Tareas 012

- [x] **T1. Extraer la reescritura de direcciones de unifyUploads y sumar FILE_ROW_MODELS.** RF-6
  - Hecho cuando: `verify:file-dedup` sigue en verde.
- [x] **T2. Chequeo `verify-archived-image-compression.ts` (en rojo).** RF-1 a RF-7, RF-12
  - Hecho cuando: corre y falla porque falta el módulo.
- [x] **T3. Módulo `archivedImageCompression.ts`.** RF-1 a RF-5, RF-7, RF-10 a RF-12
  - Hecho cuando: el chequeo de T2 pasa.
- [x] **T4. Enganchar en archivar, eliminar y arranque.** RF-1, RF-2, RF-8, RF-9
  - Hecho cuando: tsc y lint en verde.
- [x] **T5. Corrida real en local y validación RF por RF.**
  - Hecho cuando: resumen del log sin imágenes rotas.
