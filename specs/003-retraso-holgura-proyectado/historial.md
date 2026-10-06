# Historial — Especificación 003

- 2026-10-06 — Pedido por chat. Hallazgo: el cálculo viejo (getProjectCompletionVariance) ignoraba tareas abiertas vencidas (solo se corren fechas al completar) y contaba un día hábil de más.
- 2026-10-06 — Entrevista (3 rondas): en curso vencida = hoy + duración; sin iniciar atrasada = arranca hoy; sin fecha de cierre = sin indicador; redondeo días→semanas→meses; WA en resumen PM/admin y alertas al grupo; Definición con el mismo cálculo; Archivos con secciones lado a lado.
- 2026-10-06 — Spec aprobada. Plan aprobado.
- 2026-10-06 — T1–T8 hechas. verify:schedule-forecast OK (7 casos), verify-group-alert-digest OK (con cronograma), verify-agenda-digest OK, tsc limpio, eslint sin errores en lo cambiado, build de producción OK. verify:schedule-cascade: lógica OK; su limpieza final falla (ya fallaba, borra el proyecto antes que las tareas) — se borraron a mano 3 proyectos de prueba sobrantes de la base local.
- Sin prueba en navegador todavía.
- 2026-10-06 — Prueba en Chrome (autorizada): tarjetas, filtro, proyecto/Definición, Agenda y Archivos OK. Cambio: salud + cronograma en un solo badge y una sola línea en el resumen de WA.
- 2026-10-06 — Cambio: estado único (cronograma manda con fecha de cierre), filtro Cronograma retirado, filtro de salud por estado; WA «Estado»/«Cierre». tsc, lint, verify OK.
- 2026-10-06 — WA: Estado primero y palabra unificada; Archivos: dos columnas con cualquier par de tipos. verify OK.
- 2026-10-06 — Archivos: links compartidos en una columna a la izquierda y el resto de secciones arriba a la derecha (pedido del usuario).
