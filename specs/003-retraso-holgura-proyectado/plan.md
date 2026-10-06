# Plan — Especificación 003

## Inventario de impacto

Entidad que cambia: el indicador de cronograma del proyecto (hoy `getProjectCompletionVariance` / `scheduleVarianceDays`) y el de Fase/Objetivo/Requerimiento (hoy `phaseScheduleVariance`).

| Consumidor | Estado |
|---|---|
| `delays.ts` `getProjectCompletionVariance` | ✅ se reemplaza por el pronóstico nuevo y se borra (RF-1) |
| `projectSummaries.ts` → tarjetas de `/projects` y `/projects/archived` | ✅ usa el pronóstico (RF-3) |
| `ProjectSummary.tsx` `ScheduleVarianceBadge` (tarjeta, proyecto, Definición) | ✅ texto redondeado + tooltip exacto (RF-3, RF-4) |
| `projects/[id]/page.tsx` resumen del proyecto | ✅ usa el pronóstico (RF-3) |
| `cascadeProgress.ts` Fase / Requerimiento / Objetivo | ✅ retraso proyectado (Fase) y el mayor de sus fases (Req/Obj) en vez de la suma vieja (RF-4) |
| `ProjectSummaryGrid.tsx` filtros de la lista de proyectos | ✅ filtro «Cronograma» (RF-5) |
| `agendaSummary.ts` `getProjectsSummary` → Agenda (sección de proyectos) | ✅ agrega el pronóstico; Agenda lo muestra (RF-6) |
| `notifications.ts` `buildDailyDigestText` (resumen diario PM/admin) | ✅ línea «Cronograma» por proyecto, reusa `getProjectsSummary` (RF-8) |
| `notifications.ts` `dispatchGroupAlertDigest` / `buildGroupAlertText` | ✅ línea «Cronograma» por proyecto (RF-9) |
| Bot `get_project_status` (+ regla en chontatec.ts) | ✅ agrega `schedule` (RF-7) |
| API `GET /api/v1/projects/:id` + skill del repo | ✅ agrega `schedule` (RF-10) |
| `AttachmentSections` (Archivos del proyecto y de todos los proyectos) | ✅ dos columnas en `lg` (RF-11) |
| `openSlackDays` (holgura CPM por tarea), cuellos de botella, alertas de tarea, Gantt | ➖ no cambian (fuera de alcance) |
| Rendimiento (`getProjectReport`, cumplimiento a tiempo) | ➖ no aplica: mide tareas, no el cierre del proyecto |
| Aviso individual de WhatsApp por tarea, recordatorio de reunión, cola | ➖ no aplica: son por tarea, no por proyecto |
| Exportar/Importar y respaldo | ➖ no aplica: el indicador es calculado, no se guarda |
| Página pública compartida (`publicView.ts`) | ➖ no aplica: no muestra el indicador hoy |

## Archivos

1. **Nuevo `src/lib/scheduleForecast.ts`** (servidor) — fuente única (RF-1, RF-2, RF-4):
   - `forecastTasks(countryCode, tasks, edges, today)` → `Map<taskId, { start, end, driverId | null }>`:
     - fin propio según Definiciones (completada / vencida en curso: hoy + duración / sin iniciar atrasada: arranca el primer día hábil desde hoy, dura lo planeado / resto: lo planeado);
     - corrimiento en cadena con memo recursivo sobre predecesoras, solo para tareas **sin iniciar** (las ya arrancadas no se re-planifican, igual que `propagateToSuccessors`): inicio = máx(inicio propio, FS → día hábil siguiente al fin proyectado de la predecesora, SS → inicio de la predecesora); fin = máx(fin propio, inicio + duración − 1). Ciclo → se corta.
     - `driverId`: la tarea atrasada que origina el corrimiento (se hereda por la cadena) → «qué tareas empujan el fin».
   - `getProjectForecast(projectId)` → `{ projectedEnd, plannedEnd, targetEndDate, varianceDays (+holgura / −retraso, null sin cierre), drivers: {id,title}[] }`. Solo recorre lo que depende de tareas atrasadas: si no hay ninguna, el fin proyectado es el planeado (camino rápido).
   - `phaseDelayDays(forecast, phaseTaskIds)` → días hábiles que su fin proyectado supera su fin actual, o null.
   - Diferencia de días hábiles exclusiva (`businessDaysBetween − 1`): corrige el «uno de más» del cálculo viejo.
2. **Nuevo `src/lib/scheduleVarianceLabel.ts`** (sin prisma ni "use client", lo usan servidor, cliente y WhatsApp): `scheduleVarianceText(days)` → «A tiempo» / «3 días de retraso» / «2 semanas de holgura» / «1,5 meses de retraso»; `scheduleVarianceTone(days)`.
3. `ProjectSummary.tsx` — `ScheduleVarianceBadge` usa el texto nuevo con `title` exacto; muestra «A tiempo» en 0 a nivel proyecto.
4. `projectSummaries.ts`, `projects/[id]/page.tsx` — `scheduleVarianceDays` sale de `getProjectForecast`.
5. `cascadeProgress.ts` — recibe el pronóstico del proyecto; fase = `phaseDelayDays` (negativo = retraso); req/obj = el peor de sus fases.
6. `ProjectSummaryGrid.tsx` + `projects/page.tsx` — param `schedule=late|ahead|ontime`, píldoras como el filtro de salud (set fijo).
7. `agendaSummary.ts` — `scheduleVarianceDays` en `PmProjectSummary`; `agenda/page.tsx` muestra el badge en cada proyecto.
8. `notifications.ts` — línea `  ↳ _Cronograma_ · 🔴 1 semana de retraso` / `🟢 3 días de holgura` / `✅ A tiempo` en el resumen y en cada proyecto de la alerta al grupo.
9. `chontatecTools.ts` `get_project_status` y `api/v1/projects/[id]/route.ts` — campo `schedule`; regla corta en `chontatec.ts`; doc en la skill.
10. `AttachmentSections.tsx` — en `lg`: grid de 2 columnas, Imágenes a la izquierda, Documentos y Enlaces a la derecha; los llamadores bajan a `lg:grid-cols-3` por columna.
11. `delays.ts` — borrar `getProjectCompletionVariance` (sin usos).

## Decisiones técnicas
- Pronóstico con pasada hacia adelante desde las tareas atrasadas (alternativa: holgura CPM «desfase − holgura» de `criticalPath.ts`). La pasada da lo mismo a nivel proyecto y además sirve para Fase/Req/Obj y para saber qué tarea empuja; solo toca la ruta que depende de una tarea atrasada.
- Texto redondeado en un archivo propio sin «use client» (regla del repo: datos compartidos con clientes no van en archivos de cliente).

## Verificación
- `scripts/verify-schedule-forecast.ts` (nuevo, `npm run verify:schedule-forecast`): casos con fechas fijas y festivos reales de CO: todo a tiempo; tarea crítica en curso vencida (hoy + duración, corre la sucesora); no crítica vencida absorbida; sin iniciar atrasada; SS; completada tarde (ya incluida); redondeo 4/5/19/20/30 días.
- `tsc`, `lint`, `verify:schedule-cascade` (no debe cambiar), build de producción. Prueba visual: queda para el usuario (o con su permiso).
