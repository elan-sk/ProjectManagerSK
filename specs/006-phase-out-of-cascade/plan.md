# Plan 006 — La fase sale de la cascada de definición

## Inventario de impacto

Entidades que cambian: Tarea (gana requerimiento), Requerimiento (su avance sale de tareas), Fase (deja de editar requerimientos).

| Consumidor | Estado | RF |
|---|---|---|
| Cálculo de avance — `src/lib/cascadeProgress.ts` | ✅ se ajusta | RF-4, 5, 6, 8, 19, 21, 22 |
| Orden cronológico — `src/lib/definitionOrder.ts` | ✅ se ajusta | RF-7 |
| Página del proyecto — `projects/[id]/page.tsx` | ✅ se ajusta (pasa requerimientos y tareas a los formularios) | RF-9, 12, 19 |
| Resumen de avance — `DefinitionSummary.tsx` | ✅ se ajusta | RF-18, 19, 20 |
| Pestaña Definición — `DefinitionTab.tsx` | ✅ se ajusta (tipos y props) | RF-18 a 22 |
| Panel de objetivos — `ObjectivesPanel.tsx` | ➖ no aplica: lee el avance ya calculado de sus requerimientos | RF-6 |
| Panel de requerimientos — `RequirementsPanel.tsx` | ✅ se ajusta | RF-12, 13, 21 |
| Panel de fases — `PhasesPanel.tsx` | ✅ se ajusta | RF-22 |
| Formulario de fase — `PhaseForm.tsx` | ✅ se ajusta (solo nombre) | RF-22 |
| `PhaseRequirementsForm.tsx` y `updatePhaseRequirements` | ✅ se eliminan (quedan sin uso) | RF-22 |
| Acciones de Definición — `definitionActions.ts` | ✅ se ajusta | RF-12, 13, 14, 16, 25 |
| Formulario de tarea nueva — `NewTaskForm.tsx` + `addTask` | ✅ se ajusta | RF-9, 14 |
| Detalle de tarea — `tasks/[taskId]/page.tsx` | ✅ se ajusta | RF-10, 11 |
| Cambio de fase — `updateTaskPhase` | ➖ no aplica: no toca el requerimiento | RF-17 |
| Insertar tarea junto a otra — `actions.ts` | ✅ se ajusta | RF-15 |
| Duplicar tarea — `taskOps.ts` | ✅ se ajusta | RF-15 |
| Unir tareas — `taskOps.ts` | ✅ se ajusta: toma el requerimiento de la primera, igual que la fase | RF-15 |
| Link del cliente — `publicView.ts`, `PublicDefinitionView.tsx` | ✅ se ajusta (dos bloques; los porcentajes llegan solos) | RF-23 |
| API tarea — `api/v1/tasks/[id]` | ✅ se ajusta | RF-24 |
| API crear tarea — `api/v1/projects/[id]/tasks` | ✅ se ajusta | RF-24 |
| API proyecto — `api/v1/projects/[id]` | ➖ no aplica: el campo nuevo de la tarea sale solo en la respuesta | RF-24 |
| API requerimientos — `api/v1/projects/[id]/requirements` | ➖ no aplica: sigue aceptando `phaseIds` | RF-25 |
| API fase — `api/v1/projects/[id]/phases/[phaseId]` | ✅ se ajusta (solo toca vínculos si se envían) | RF-25 |
| Bot — `src/lib/chontatecTools.ts` | ✅ se ajusta | RF-26 |
| Guías de asistentes — `pmsk`, `sdd`, `project-manager-sk` | ✅ se ajusta | RF-27 |
| Gantt, Kanban, Calendario | ➖ no aplica: agrupan por fase; fuera de alcance filtrar por requerimiento | — |
| Buscador del encabezado y filtros | ➖ no aplica: no buscan requerimientos | — |
| Importar cronograma — `api/import` | ➖ no aplica: fuera de alcance; las tareas entran sin requerimiento | — |
| Scripts de carga y semillas — `scripts/*` | ➖ no aplica: el campo es opcional | — |
| WhatsApp, notificaciones, resúmenes, cola de alertas | ➖ no aplica: no leen requerimientos ni la cascada | — |
| Subproyectos — aporte de objetivos, `objectiveLink.ts` | ➖ no aplica: es a nivel objetivo; no hay movimiento de tareas entre proyectos | RF-6 |
| Referencias en textos — `fileReferences.ts` | ➖ no aplica: solo lee la descripción del requerimiento | — |
| Colores — `statusColors.ts` | ➖ no aplica: se reutilizan los colores de nivel existentes | — |
| Respaldo completo — `settings/FullBackupPanel.tsx` | ⚠️ se verifica en T1 que incluya la columna nueva | RF-3 |
| Permisos | ✅ se ajusta con `requireProjectAdmin` / `guard` existentes | RF-10, 11, 14 |

## Datos y migración

Una sola migración, `prisma/migrations/<fecha>_task_requirement/migration.sql`, aditiva:

```sql
ALTER TABLE `Task` ADD COLUMN `requirementId` VARCHAR(191) NULL;
CREATE INDEX `Task_requirementId_idx` ON `Task`(`requirementId`);
ALTER TABLE `Task` ADD CONSTRAINT `Task_requirementId_fkey`
  FOREIGN KEY (`requirementId`) REFERENCES `Requirement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE `Task` t
JOIN (
  SELECT `A` AS phaseId, MIN(`B`) AS requirementId
  FROM `_PhaseRequirements` GROUP BY `A` HAVING COUNT(*) = 1
) one ON one.phaseId = t.phaseId
JOIN `Requirement` r ON r.id = one.requirementId AND r.projectId = t.projectId
SET t.requirementId = one.requirementId
WHERE t.requirementId IS NULL;
```

- En `_PhaseRequirements`, `A` es la fase y `B` el requerimiento (confirmado en la migración inicial).
- El segundo `JOIN` descarta vínculos cruzados entre proyectos, si existieran.
- `ON DELETE SET NULL` cubre RF-16 en la base, sin código.
- `schema.prisma`: `Task.requirementId String?` + relación, `Requirement.tasks Task[]`, `@@index([requirementId])`.
- Cubre RF-1, RF-2, RF-3, RF-16.

## Qué se reutiliza

- `SearchableSelect` para el campo «Requerimiento» (formulario y detalle).
- `ModalTrigger` / `Modal`, `ProgressBar`, `pctStatus`, `ScheduleVarianceBadge`, `DEFINITION_LEVEL_COLOR` en la pestaña Definición.
- `guard` de `definitionActions.ts` y `requireProjectAdmin` para permisos.
- `groupDelayDays`, `getProjectTaskSlack` y las funciones de conteo de `cascadeProgress.ts`, generalizadas de «fase» a «grupo de tareas».
- Patrón de `InlinePhase` para la edición en línea del detalle.
- Patrón de `scripts/verify-definition-order.ts` para los chequeos.

Se construye desde cero: la lista de asignación masiva (`RequirementTasksForm`). `UserCheckList` es de personas y no agrupa; se replica su aspecto, no se fuerza su reutilización.

## Archivos

| Archivo | Cambio | RF |
|---|---|---|
| `prisma/schema.prisma`, migración nueva | columna, relación, traspaso | 1, 2, 3, 16 |
| `src/lib/cascadeProgress.ts` | cálculo por tareas con respaldo; tareas sin requerimiento; requerimientos derivados por fase | 4, 5, 8, 19, 21, 22 |
| `src/lib/definitionOrder.ts` | inicio del requerimiento por sus tareas | 7 |
| `src/lib/taskRequirement.ts` (nuevo) | `requirementForProject(requirementId, projectId)`: valida pertenencia; lo usan web, API y bot | 1, 14 |
| `projects/[id]/tasks/[taskId]/actions.ts` | `updateTaskRequirement(taskId, requirementId \| null, actor?)` | 10, 11, 14 |
| `projects/[id]/tasks/[taskId]/InlineRequirement.tsx` (nuevo) | edición en línea con buscador | 10, 11 |
| `projects/[id]/tasks/[taskId]/page.tsx` | muestra el requerimiento | 10, 11 |
| `projects/[id]/actions.ts` | `addTask` acepta requerimiento; insertar junto a otra hereda | 9, 14, 15 |
| `projects/[id]/NewTaskForm.tsx` | campo opcional | 9 |
| `projects/[id]/taskOps.ts` | duplicar y unir heredan | 15 |
| `projects/[id]/definitionActions.ts` | `setRequirementTasks(requirementId, taskIds, actor?)`; `updatePhase` solo toca vínculos si se piden; se quita `updatePhaseRequirements` | 12, 13, 14, 25, 28 |
| `projects/[id]/RequirementTasksForm.tsx` (nuevo) | lista por fase, buscador, marcar toda la fase | 12, 13 |
| `projects/[id]/RequirementsPanel.tsx` | tareas por fase; botón «Tareas» | 12, 21 |
| `projects/[id]/PhasesPanel.tsx`, `PhaseForm.tsx` | sin selector; requerimientos de solo lectura | 22 |
| `projects/[id]/PhaseRequirementsForm.tsx` | se elimina | 22 |
| `projects/[id]/DefinitionSummary.tsx`, `DefinitionTab.tsx`, `page.tsx` | dos bloques, aviso, props | 18, 19, 20 |
| `src/app/share/PublicDefinitionView.tsx` | dos bloques | 23 |
| `api/v1/tasks/[id]/route.ts` | devuelve y acepta el requerimiento | 24 |
| `api/v1/projects/[id]/tasks/route.ts` | acepta el requerimiento al crear | 24 |
| `api/v1/projects/[id]/phases/[phaseId]/route.ts` | `requirementIds` opcional de verdad | 25 |
| `src/lib/chontatecTools.ts` | `create_task`, `update_task`, `get_task_details`; se simplifica el renombrado de fase | 26 |
| `.claude/skills/project-manager-sk/SKILL.md`, `~/.claude/skills/pmsk/SKILL.md`, `~/.claude/skills/sdd/SKILL.md` | cascada nueva | 27 |
| `scripts/verify-requirement-progress.ts`, `scripts/verify-task-requirement-backfill.ts` (nuevos), `scripts/verify-definition-order.ts`, `package.json` | chequeos | criterios |
| `scripts/compare-requirement-progress.ts` (nuevo) | informe antes/después para el ensayo | criterios |

## Lógica principal

```
resumenDeGrupo(tareas):
  pct        = completadas / total (0 si no hay)
  atrasadas  = abiertas con fin planeado < hoy
  holgura    = mínima entre las abiertas
  retraso    = groupDelayDays(pronóstico, tareas)

requerimiento:
  si tiene tareas vinculadas:
    resumenDeGrupo(sus tareas); fases = las fases de esas tareas; respaldo = no
  si no:
    como hoy (promedio de sus fases vinculadas); respaldo = sí

fase:
  resumenDeGrupo(todas sus tareas)                 (sin cambio)
  requerimientos = distintos requerimientos de sus tareas

tareasSinRequerimiento = tareas con requirementId nulo, solo si el proyecto tiene requerimientos

setRequirementTasks(requerimiento, idsMarcados):
  permiso: guard(proyecto)
  rechazar si algún id no es de ese proyecto
  en una transacción:
    tareas del requerimiento que no están en idsMarcados → requirementId = null
    tareas en idsMarcados → requirementId = requerimiento
```

`updatePhase` deja de borrar vínculos cuando no se envían: hoy un cambio de nombre sin `requirementIds` los vacía, y el bot lo compensa releyéndolos. Con el cambio, solo se sincronizan si el llamado lo pide.

## Interfaz

- **Resumen:** contenedor `grid` con Alcance (`sm:grid-cols-2`, objetivos y requerimientos) y Cronograma (fases); en `lg` van en una fila con borde izquierdo en Cronograma; en `sm` Cronograma baja con borde superior; debajo de `sm` todo apilado. Subproyectos conserva su grupo.
- **Aviso:** «N tareas sin requerimiento» como `ModalTrigger`; el modal lista las tareas por fase con enlace, con `max-h` y desplazamiento propio en ambos ejes definidos.
- **Requerimiento:** bajo la barra de avance, sus tareas agrupadas por fase con estado; en respaldo, la lista de fases actual sin el enlace de edición.
- **Fase:** chips de requerimientos de solo lectura.
- **Tarea:** «Requerimiento» junto a la fase en el detalle; campo opcional en el formulario nuevo, con opción «Sin requerimiento».

## Decisiones técnicas

- **Campo en la tarea, no tabla intermedia.** Descartado muchos a muchos: la decisión es un requerimiento por tarea, y un campo evita contar avance doble.
- **Traspaso dentro de la migración.** Descartado un script aparte: en Hostinger no hay consola; solo corre `prisma migrate deploy` en el build.
- **Respaldo por requerimiento, no global.** Descartado un interruptor general: cada requerimiento cambia de cálculo cuando recibe su primera tarea, sin fecha de corte.
- **Permiso PM/administrador.** Descartado `canEditTask`: incluye al asignado, y el requerimiento es parte de la Definición. Corregido en la spec.
- **No se elimina `_PhaseRequirements`.** Va en una especificación posterior, cuando los proyectos activos tengan sus tareas vinculadas.

## Verificación

- `npx tsc --noEmit`, `npm run lint`.
- `verify:definition-order` actualizado; `verify:requirement-progress` nuevo (cálculo por tareas, respaldo, dos requerimientos en la misma fase con avances distintos); `verify:task-requirement-backfill` nuevo (regla de traspaso sobre datos sembrados en una transacción que se revierte).
- `verify:subprojects`, `verify:insert-adjacent-task`, `verify:move-task-group` en verde.
- Ensayo general sobre copia fresca de producción:
  1. importar la copia;
  2. `compare-requirement-progress` guarda el avance «antes»;
  3. `npx prisma migrate deploy`;
  4. el informe muestra por requerimiento antes / después, tareas vinculadas, tareas sin requerimiento y requerimientos en respaldo.
- Sin navegador salvo autorización. Queda para prueba visual: Resumen en los tres anchos, lista de asignación, detalle de tarea y link del cliente.

## Despliegue

1. Respaldo de producción desde phpMyAdmin.
2. Zip con `deploy-hostinger`; la migración y el traspaso corren en el build.
3. Si falla el build, el sitio sigue con la versión anterior y la base sin tocar o con la columna nueva vacía, que la versión anterior ignora.
