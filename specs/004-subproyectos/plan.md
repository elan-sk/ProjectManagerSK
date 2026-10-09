# Plan 004 — Subproyectos

Aprobado vía `/solo-ya` (2026-10-09).

## Inventario de impacto

Entidad que cambia: **Project** (nuevo `parentId`) y **Objective** (nuevo `parentObjectiveId`); comportamiento que cambia: «PM de un proyecto» pasa a incluir al PM del padre.

| Consumidor | Estado |
|---|---|
| `permissions.ts`: `canSeeProject`, `visibleProjectWhere`, `getProjectAdmin`, `canEditTask`, `canReviewTask`, `canParticipateInProject` | ✅ se ajusta (RF-5, RF-6, RF-8) con helpers `isProjectPm` / `managedProjectWhere` |
| `visibility.ts`, `threadsApi.ts`, `taskDesign.ts` (selects para `canSeeProject`) | ✅ seleccionan `parent.pmId` (RF-8) |
| `allowsSelfReview` | ➖ no aplica: «una sola persona en el proyecto» sigue mirando el PM propio |
| `isReviewerAnywhere`, `isPmOrAdminAnywhere`, layout `pmCount`, archived `isPM`, collisions `pmCount`, upload `allowHtml`, chontatec `pmCount` | ➖ no aplica: un PM de padre ya es PM de algo |
| Panorama general (`projects/page.tsx` `myPmProjectIds`) | ✅ RF-7, RF-27 (filtro Proyecto reemplaza Buscar) |
| Agenda (`pmProjectIds`, «Mis proyectos») | ✅ RF-7, RF-24 |
| Rendimiento (`performance/page.tsx`, `[userId]`) | ✅ RF-7 (proyectos administrados incluyen hijos) + RF-26 ícono |
| Buscador `api/search` | ✅ RF-7 + RF-26 (doble ícono en hits) |
| Credenciales `credentials.ts` (ver/administrar) y `canManageCred` de la tarea | ✅ RF-5 |
| Ocultar (`setProjectHidden`), archivar (`setProjectArchived`), eliminar (`archiveProject`) + botones | ✅ RF-28 cascada, RF-29 hijo solo; ocultar también lo puede el admin PM del padre (RF-5) |
| Página del proyecto: encabezado, Tablero, Gantt, Calendario, Archivos, Definición | ✅ RF-9…RF-23 |
| `ProjectIcon` (todas sus apariciones) | ✅ RF-26 vía prop `parent` |
| `getProjectSummaryRows` / Vista resumen / Archivados | ✅ RF-23, RF-25 (agrupar en la grilla) |
| `getProjectsSummary` en resumen diario (`notifications.ts:439`) | ➖ no aplica (RF-32): el resumen diario no cambia |
| Avisos: `notifications.ts`, `scheduler.ts`, cola WhatsApp, `shareActions` (comentarios del cliente → PM) | ➖ no aplica (RF-32) |
| Header alerts (`layout.tsx:98`, tareas de mis proyectos) | ➖ no aplica (RF-32: son avisos personales) |
| Chat (bot) `chontatecTools.ts`: alcance de PM (724/757/790), permiso de alerta (1240), descripción de proyecto | ✅ RF-7 / RF-5 / RF-31 |
| API v1 `projects` GET/PATCH | ✅ RF-30 |
| Link compartido `publicView.ts` / `share/[token]` | ➖ no aplica (RF-33): sin padre en el DTO |
| `cascadeProgress.ts` (avance de objetivos) | ✅ RF-15 |
| `ObjectiveForm` / `definitionActions` | ✅ RF-14 |
| Export/backup (`api/export`, `api/backup/full`) | ➖ revisar: si exportan columnas por tabla completa, `parentId` viaja solo; import crea proyectos sin padre (independientes) |
| Colisiones | ➖ no aplica: tareas siguen igual; solo ícono (RF-26) |
| Rendimiento agregado del grupo | ➖ fuera de alcance |

## Datos
- Migración `20261009120000_subprojects`: `Project.parentId` (FK a Project, `ON DELETE SET NULL`), `Objective.parentObjectiveId` (FK a Objective, `ON DELETE SET NULL`). Todo existente queda independiente.

## Reutilización
- Vistas del padre: el mismo armado del Panorama general (tareas de varios proyectos con `showProjectName`, permisos por tarea `canManageProject`) aplicado al grupo, dentro de `projects/[id]/page.tsx` (la consulta pasa de `project.tasks` a `task.findMany({ projectId in grupo })`).
- `ComboFilter` para el filtro Proyecto; `AvatarGroup`-like para el grupito de logos (nuevo `ProjectIconGroup` en `ProjectIcon.tsx`).
- `CreateProjectForm` + `createProject` con `parentId` oculto; `useConfirm` para quitar del grupo.
- Lógica pura nueva en `src/lib/subprojects.ts` (reglas de dos niveles, opciones del filtro, expansión padre→hijos, agregado de resúmenes) con chequeo `scripts/verify-subprojects.ts`.

## Partes
1. Esquema + migración + generate. (RF-1, RF-14)
2. `lib/subprojects.ts`: `validateParent`, `expandProjectFilter`, `projectFilterOptions`, `groupSummaryRows`. + verify. (RF-1, RF-2, RF-18, RF-23, RF-27)
3. Permisos centralizados. (RF-5…RF-8)
4. Acciones: `setProjectParent` (vincular/quitar), `createProject` con parentId, cascadas. (RF-10…RF-13, RF-28, RF-29)
5. `ProjectIcon` con `parent` + `ProjectIconGroup`; propagar a todas las apariciones. (RF-26)
6. Página del proyecto: grupo de tareas, filtro Proyecto, Gantt agrupado, Archivos, totales del encabezado, Definición (bloque Subproyectos, «Subproyecto de»). (RF-9, RF-17…RF-23)
7. Objetivos: «Contribuye a» + cascada. (RF-14…RF-16)
8. Panorama general (filtro Proyecto), Vista resumen agrupada, Agenda «Mis proyectos». (RF-24, RF-25, RF-27)
9. API, bot, buscador. (RF-30, RF-31, RF-26)
10. Verificación: tsc, lint, verify:subprojects y verify existentes.

## Decisión técnica
- Gantt agrupado: GanttView agrupa por `phaseId`; para agrupar por proyecto se ordenan las tareas por (proyecto del grupo, fase, inicio) y las fases de hijos llevan el nombre «Hijo › Fase»; la barra resumen del hijo se agrega como prop `projectSummaries`. Alternativa descartada: un Gantt nuevo (duplicaría ~1.000 líneas).
