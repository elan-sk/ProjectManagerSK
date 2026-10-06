# Historial — 001 Archivos sin duplicados

- 2026-10-05 — Pedido por chat (modo chat, sin PMSK). Fuentes leídas: conversación, código de subida/galería/borrado/vistas de Archivos, log de producción del día. Biblioteca de Depura sin conexión: no consultada.
- 2026-10-05 — Entrevista ronda 1: alcance toda la app; unificar existentes; mismo lugar → no agregar y avisar; links iguales = mismo recurso.
- 2026-10-05 — Entrevista ronda 2: vista Archivos con todo; mismo lugar = misma sección; comentarios sin aviso; unificación en producción una sola vez durante el deploy.
- 2026-10-05 — Spec 001 escrita (borrador). Pendiente: aprobación 1 y constitución del repo (no existía `docs/constitution.md`).
- 2026-10-05 — Adelantado fuera de la spec por un error en producción (chat del bot se caía al subir archivos): `deleteFileIfUnused` ya no usa `contains` (falla de collation) y nunca borra ante un error (base de RF-10). La spec sigue en borrador esperando aprobación; RF-9 (contar íconos, fotos, descripciones, comentarios) sigue pendiente.
- 2026-10-05 — Aprobación 1: spec 001 y constitución (`docs/constitution.md`) aprobadas por el usuario ("aprobado").
- 2026-10-06 — Primera parte (pedido del usuario: «primero la vista»): la vista Archivos agrupa por dirección (mismo archivo) con «Usado en N lugares» y sin borrar desde una ficha agrupada. Pendiente: plan (aprobación 2) del resto — contenido idéntico al subir (SHA-256), aviso «ya está cargado aquí», ajustes y rondas en la vista, borrado seguro ampliado y unificación de lo ya subido.
- 2026-10-06 — Plan aprobado («sí, completemos esas tareas»). T1–T10 hechas:
  - Nombre por contenido (SHA-256, .jpeg→.jpg) en saveUploadedFile; no reescribe si ya existe.
  - attachmentDedup (inSection/splitNew) en las acciones de tarea, checklist, ajustes, Prueba, Aceptación, Definición, link del cliente, API (`skipped`) y bot (lo cuenta). Envíos de ronda: un archivo repetido en el mismo envío va una vez.
  - Decisión: los adjuntos de comentarios conservan su fila (están ligados al comentario); el archivo físico se reusa y la vista Archivos los agrupa por dirección.
  - Aviso neutro «Este archivo ya está cargado aquí.» con el Toast (variante info) en la app; en el link del cliente, en gris en el mismo widget.
  - Vista Archivos y galería con archivos de Ajustes y rondas; «Usado en» con tarea · sección; Definición enlazada.
  - fileReferences.ts: una sola lista de referencias (9 columnas + 16 textos) para el borrado seguro y la unificación.
  - Unificación al arranque (unifyUploads.ts). En la base local, con respaldo previo (referencias.json + copia de uploads en el scratchpad): corrida 1 → 57 revisadas, 55 unificadas (9 iguales a otra), 74 referencias reescritas, 55 apartadas (~56 MB); corrida 2 → sin cambios; auditoría: 48 referencias, todas abren salvo 2 que ya faltaban antes (informadas, no tocadas).
  - Verificaciones: verify:file-dedup (nuevo), persistent-uploads, svg-upload, paste-image, comments, uploads-route, group-alert-digest: OK. tsc OK; lint sin errores nuevos.
- 2026-10-06 — «Usado en»: la ficha muestra el uso más reciente + «+N» que abre la lista (ReferencePopover); el botón «Ver tarea» de los visores abre la lista si hay más de un lugar (TaskLinkButton). Galería verificada: 1 elemento por contenido distinto.
