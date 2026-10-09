# Historial — 004 Subproyectos

- 2026-10-09 — Modo chat (/sdd). Fuentes: pedido por chat, MEMORY.md, constitución, código (página de proyecto, Panorama, Agenda, permisos, resúmenes, buscador, ProjectIcon, cascada). Sin biblioteca (proyecto propio Next.js, no aplica).
- 2026-10-09 — Ronda 1: el usuario descarta hijos como cards → el padre es un panorama del grupo; padre con tareas propias; totales suman padre + hijos. Propone ligar Definición por objetivos.
- 2026-10-09 — Ronda 2: objetivo hijo → objetivo padre; filtro «Proyecto» reemplaza «Buscar» en vistas del padre; Gantt agrupado por proyecto; Vista resumen solo padre + grupito.
- 2026-10-09 — Ronda 3: bloque Subproyectos con crear/vincular/quitar; cascada al archivar/ocultar/eliminar; sin avisos al PM padre; API y bot informan, link compartido igual.
- 2026-10-09 — Spec escrita y autorrevisada (RF-26: el link del cliente de un hijo no revela al padre). Pendiente aprobación 1.
- Nota: hay cambios sin commitear de otra sesión (LinkFavicon, api/favicon, MEMORY.md); no se tocan.
- 2026-10-09 — /solo-ya: tomado como aprobación de spec y plan. Commit de seguridad 5c73b04 con los cambios previos del usuario (favicon).
- 2026-10-09 — T1–T10 hechas. Migración aplicada en la BD local. tsc OK; lint 11 errores / 7 avisos = mismos que antes del cambio; verify:subprojects, search-filters, schedule-forecast, schedule-cascade, credentials, file-dedup y agenda-digest OK. Prueba de humo de solo lectura de las consultas nuevas en la BD local OK (sin datos de grupos reales).
- 2026-10-09 — Ajuste: quitar del grupo solo el PM del principal o admin (antes también el PM del hijo, contradecía RF-13).
- 2026-10-09 — Sin prueba en navegador (no autorizada): lo visual queda pendiente.
- 2026-10-09 — Usuario confirma cascada tal como está (padre → hijos; hijo por separado). Aplicada la sugerencia «Grupo: N subproyectos» en la tarjeta del principal. Error reportado = next dev con cliente Prisma viejo (no reiniciado).
- 2026-10-09 — Prueba en Chrome (autorizada) con grupo «[Prueba] Ecosistema digital» + App móvil, Sitio web y Tienda en línea (creada desde la UI): Tablero, Gantt, Calendario, Archivos, Definición, Vista resumen, Panorama (filtro Proyecto), Agenda, buscador, página del hijo, objetivo «Contribuye a», quitar/vincular, archivar/desarchivar en cascada → OK. Corregido: principal archivado no mostraba su grupo; aviso de tareas sin completar ahora cuenta el grupo; calendario del principal sin prefijo redundante.
