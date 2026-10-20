# Plan 011 — Avance del proyecto con el avance interno de las tareas

Diagrama del cambio: [change-diagram.png](change-diagram.png) (fuente `change-diagram.dot`).

## Inventario de impacto

Comportamiento que cambia: (A) el % de avance de grupos de tareas; (B) el fin proyectado de tareas abiertas vencidas.

| Consumidor | Dónde | Estado |
|---|---|---|
| Fases, requerimientos y objetivos (Definición) | `src/lib/cascadeProgress.ts` (`phasePct`, `summarizeRequirement`) | ✅ se ajusta (RF-3) |
| Bot `get_project_definition` | `src/lib/chontatecTools.ts` (usa cascadeProgress) | ✅ hereda (RF-5) |
| Link compartido con el cliente (Definición pública) | `src/lib/publicView.ts` (usa cascadeProgress) | ✅ hereda (RF-5) |
| Resumen dentro del proyecto (barra + `%·N/M tareas`) | `src/app/(app)/projects/[id]/page.tsx` → `ProjectProgress` | ✅ se ajusta (RF-3, RF-5) |
| Encabezado Definición (`DefinitionSummary`, % grande) | `DefinitionTab.tsx` / `DefinitionSummary.tsx` | ✅ se ajusta (RF-5) |
| Subproyectos: lista, popovers, encabezados en Gantt | `page.tsx` (`childPct`), `SubprojectsPanel`, `GanttView` `projectHeaders` | ✅ se ajusta (RF-4) |
| Gantt: % por fase | `GanttView.tsx` (línea ~1023) + armado de `GanttTask` en `projects/[id]/page.tsx` y `projects/page.tsx` | ✅ se ajusta (RF-5) |
| Tarjetas de Proyectos y Archivados (y grupo principal) | `src/lib/projectSummaries.ts` + `ProjectSummaryGrid.tsx` | ✅ se ajusta (RF-4, RF-5) |
| Agenda (proyectos y subproyectos) | `src/lib/agendaSummary.ts` + `agenda/page.tsx` | ✅ se ajusta (RF-4, RF-5) |
| Resumen diario de WhatsApp (barra de avance) | `src/lib/notifications.ts` (usa agendaSummary) | ✅ se ajusta (RF-5); la línea «Completadas N/M» queda |
| Fin proyectado / retraso (tarjetas, resumen, Definición, Agenda, WhatsApp, bot, API) | `src/lib/scheduleForecast.ts` (`getProjectForecast`, `forecastTasks`) | ✅ se ajusta (RF-6, RF-7); todos lo consumen de ahí |
| Barrita propia de cada tarea (tarjeta, ficha) | `taskProgress()` | ➖ no cambia: es la entrada del cálculo, no el resultado |
| Bot `get_project_status` / API `projects/[id]` | `computePhase`, `scheduleForApi` | ➖ no devuelven % hoy; el retraso lo heredan del pronóstico |
| «Fase» del proyecto (Planificación/En ejecución/Completado) | `projectPhase(total, completed, started)` | ➖ depende de completadas, no del % (fuera de alcance) |
| Alertas de vencida, salud, alertas de grupo WhatsApp, cola | `delays.ts` `getTaskAlert`, `projectHealth`, `notifications.ts` | ➖ fuera de alcance (decisión de la entrevista) |
| Holgura (`openSlackDays`, ruta crítica) | `criticalPath.ts` | ➖ usa fechas planeadas, no el avance |
| Métricas de desempeño, buscador, filtros, exportaciones, backup | `performance`, `search`, `backup` | ➖ no usan el % de avance |
| Conteos «N/M completadas» (`ChildCount`, `taskCounts`) | varios | ➖ se mantienen (RF-5) |

## Archivos

- `src/lib/taskProgress.ts` — **nuevo en este archivo**: `TASK_CONTRIBUTION_SELECT` (campos de Prisma que hacen falta), `taskInReview(task)`, `taskContribution(task)` (0–100, RF-1/RF-2), `averageContribution(tasks)` (RF-3) y `forecastRemainingShare(task)` (RF-6/RF-7). Reutiliza `taskProgress`, `taskReviewState` (statusColors) y `deliverableEvidenceLoaded`.
- `src/lib/cascadeProgress.ts` — `phasePct` usa `averageContribution`; las consultas de fases y requerimientos suman `TASK_CONTRIBUTION_SELECT`.
- `src/lib/projectSummaries.ts`, `src/lib/agendaSummary.ts` — agregan `progressSum` (suma de aportes) al resumen; el % sale de `progressSum ÷ total`, y en grupos se suman ambos. Consultas con `TASK_CONTRIBUTION_SELECT`.
- `src/components/ProjectSummary.tsx` (`ProjectProgress`), `ProjectSummaryGrid.tsx`, `agenda/page.tsx`, `notifications.ts` — reciben y muestran ese %; el texto `N/M tareas` no cambia.
- `src/app/(app)/projects/[id]/page.tsx` — `summaryPct` y `childPct` con `averageContribution`; cada `GanttTask` lleva `contribution`. `DefinitionTab`/`DefinitionSummary` reciben el %.
- `src/app/(app)/projects/page.tsx` — `GanttTask` con `contribution` (su include ya trae los campos o se suman).
- `src/app/(app)/projects/[id]/GanttView.tsx` — `phasePct` = promedio de `contribution`.
- `src/lib/scheduleForecast.ts` — `ForecastTask.remainingShare?` (por defecto 1, compatibilidad); en `own()`: vencida abierta → `max(1, ceil(duración × remainingShare))` días desde hoy. `getProjectForecast` consulta los campos y calcula `remainingShare`.
- `scripts/verify-task-contribution.ts` + `package.json` `verify:task-contribution` — chequeo de RF-1/2/3/6/7.

## Lógica

```
taskInReview(t) =
  QA: alguna ronda sin resultado, o aprobada y la tarea no completada
  ACCEPTANCE: alguna ronda sin resultado, o aceptada y no completada
  MILESTONE: evidencia «Resultado» cargada
taskContribution(t) =
  COMPLETED → 100
  NOT_STARTED → 0
  taskInReview(t) → 90
  p = taskProgress(t) → p ? min(90, round(done/total*100)) : 25
averageContribution(ts) = ts.length ? round(sum(contribution)/ts.length) : 0
forecastRemainingShare(t) = taskInReview(t) ? 0 : 1 - taskContribution(t)/100
own(): vencida y no NOT_STARTED/COMPLETED → fin = hoy + max(1, ceil(duración × share)) días hábiles
```

Nota: «Sin iniciar» aporta 0 aunque tenga pasos marcados (estado manda, RF-1).

## Decisiones técnicas

- Calcular en memoria con los campos ya cargados (o sumados al `select`) en vez de guardar el % en la base: sin migración (RNF) y sin riesgo de que quede desactualizado. Descartado: columna `progress` en `Task` (habría que recalcularla en cada cambio de paso, ronda o adjunto).
- `remainingShare` opcional en `ForecastTask`: el script `verify:schedule-forecast` y cualquier llamada vieja siguen funcionando igual.

## Verificación

- `npx tsc --noEmit`, `npm run lint` (sin errores nuevos; el de `GanttView.tsx:285` ya existía).
- `npm run verify:task-contribution` (nuevo): casos de RF-1, RF-2, RF-3 y casos límite de la spec; RF-6/RF-7 con `buildProjectForecast`.
- `npm run verify:schedule-forecast`, `verify:requirement-progress`, `verify:subprojects` (regresión).
- Visual (sin navegador, queda para revisión del usuario): resumen, Definición, Gantt, Agenda.
