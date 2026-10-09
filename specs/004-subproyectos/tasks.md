# Tareas 004 — Subproyectos

- [x] **T1. Esquema + migración `20261009120000_subprojects` (Project.parentId, Objective.parentObjectiveId).** RF-1, RF-14
  - Hecho cuando: `migrate deploy` local OK y `migrate diff` vacío. ✅
- [x] **T2. `lib/subprojects.ts` + `verify:subprojects`.** RF-1, RF-2, RF-18, RF-23, RF-24, RF-27, RF-28
  - Hecho cuando: el chequeo pasa. ✅
- [x] **T3. Permisos: `isProjectPm`, `managedProjectWhere`, `PM_SCOPE_SELECT` en canSee/getProjectAdmin/canEdit/canReview/canParticipate, credenciales, bot.** RF-5…RF-8
- [x] **T4. Acciones: crear subproyecto, vincular/quitar (`setProjectParent`), cascadas de ocultar/archivar/eliminar con aviso.** RF-10…RF-13, RF-28, RF-29
- [x] **T5. Doble ícono (`ProjectIcon parent`) + `ProjectIconGroup` en todas las apariciones.** RF-26
- [x] **T6. Página del proyecto principal: tareas del grupo, filtro Proyecto, Gantt agrupado con barra resumen, Calendario, Archivos, totales del grupo, «Subproyecto de».** RF-17…RF-23
- [x] **T7. Definición: bloque Subproyectos y objetivos «Contribuye a» con avance en cascada.** RF-9, RF-14…RF-16
- [x] **T8. Panorama general (filtro Proyecto), Vista resumen agrupada y Mis proyectos de Agenda.** RF-24, RF-25, RF-27
- [x] **T9. API (parent/children, PATCH parentId, objetivos), bot, buscador y documentación de la API.** RF-26, RF-30, RF-31
- [x] **T10. Verificación: tsc, lint (sin problemas nuevos), verify:subprojects y verify existentes, prueba de humo de consultas en BD local.**
