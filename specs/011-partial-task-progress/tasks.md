# Tareas 011

- [x] **T1. Regla de aporte y su chequeo** (`taskProgress.ts`, `verify-task-contribution.ts`). RF-1, RF-2, RF-3
  - Hecho cuando: `npm run verify:task-contribution` pasa con los casos de la spec.
- [x] **T2. Pronóstico con lo que falta.** RF-6, RF-7, RF-8
  - Hecho cuando: el chequeo cubre vencida al 90 %, sin checklist y en revisión; `verify:schedule-forecast` sigue en verde.
- [x] **T3. Definición (fases, requerimientos, objetivos).** RF-3, RF-5
  - Hecho cuando: `cascadeProgress` usa `averageContribution`; `verify:requirement-progress` en verde.
- [x] **T4. Resumen del proyecto, subproyectos y Gantt.** RF-4, RF-5
  - Hecho cuando: `page.tsx`, `DefinitionSummary`, `GanttView` y `projects/page.tsx` usan el aporte; tsc en verde.
- [x] **T5. Tarjetas de proyectos, Agenda y WhatsApp.** RF-4, RF-5
  - Hecho cuando: `projectSummaries`, `agendaSummary`, `ProjectSummaryGrid`, `agenda/page.tsx` y `notifications.ts` muestran el %; tsc y lint sin errores nuevos.
- [x] **T6. Validación RF por RF.**
