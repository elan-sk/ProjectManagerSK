# Historial 007

- 2026-10-11 — Fuentes leídas: `arreglos_de_responsive_pmsk.md`, 6 imágenes de Mobile y 11 de Tablet, 4 capturas del segundo pedido. Biblioteca Depura: no se consultó; el pedido es de ajustes sobre componentes propios de esta app.
- 2026-10-11 — Entrevista: «Mis proyectos» sin los dos topes; buscador compacto por espacio disponible; menú angosto a la derecha; colores solo en el buscador (tarea fucsia, link distinto); filas de botones como desplegable con la vista actual.
- 2026-10-11 — Especificación aprobada (incluye el segundo pedido: filtros en dos columnas, título de tarea solo, estados y acciones en una línea).
- 2026-10-11 — Plan aprobado.
- 2026-10-11 — T1 a T10 implementadas. Verificación: `npx tsc --noEmit` sin errores; `npm run verify:search-filters` OK (con casos de `isCompactSearch`); lint de los 29 archivos tocados sin errores nuevos (quedan 4 de `set-state-in-effect` en GanttBar y GanttView, anteriores a esta spec).
- 2026-10-11 — Sin prueba en navegador ni en dispositivo: no se autorizó. Quedan sin probar visualmente la composición por ancho y todo lo táctil. RF-30 (líneas de dependencia del Gantt) depende de una prueba en la tablet.
- 2026-10-11 — Cambios a la spec durante la implementación: RF-13 a 768 px; WhatsApp fuera de RF-12.
- 2026-10-12 — Prueba en Chrome autorizada, con emulación: celular 390×844 táctil, tablet 1280×800 y 1100×800 táctil, escritorio 1440×900 con ratón. Pasaron: buscador en modal y botones del header, menú angosto, panel de notificaciones completo, tablero (deslizar no agarra, sostener sí; columnas en fila con scroll propio), Definición, tarea, Agenda, Archivos con desplegables y fichas a 2 columnas, popup táctil del calendario, Gantt (el scroll no se devuelve tras un toque cancelado, 9 líneas de dependencia visibles, popup con «Abrir tarea»). Escritorio sin cambios de composición.
- 2026-10-12 — Ajuste tras la prueba: «Incluir proyectos ocultos» alineado a la izquierda dentro de la grilla de filtros.
- 2026-10-12 — Sin probar: dispositivo táctil real (los toques fueron simulados) y vista vertical de tablet (800 px).
