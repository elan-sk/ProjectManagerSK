# Plan 019 — Filtros con varios elegidos y ocultar

Diagrama: [change-diagram.png](change-diagram.png)

## Inventario de impacto

| Consumidor | Estado |
|---|---|
| `ComboFilter` (desplegable compartido, 27 usos) | ✅ se ajusta — RF-1..RF-9 |
| Proyecto `projects/[id]/page.tsx`: Proyecto, Persona, Estado, Tipo, Etiqueta, Alerta | ✅ RF-5, RF-10 |
| Proyecto, vista Archivos: Proyecto, Tarea (`fileProject`, `fileTask`, links compartidos) | ✅ RF-10 |
| Panorama general `projects/page.tsx`: los 6 filtros + Archivos (`fileProject`) | ✅ RF-10 |
| Resumen de proyectos `ProjectSummaryGrid`: Buscar (`pid`, «Todos los proyectos»), Salud, link «Ver todos los proyectos» | ✅ RF-9, RF-10 |
| Agenda: Proyecto, Persona, Estado, Tipo, Alerta, Etiqueta, regla de completadas pasadas, recuadros | ✅ RF-11; recuadros siguen comparando un solo valor |
| Rendimiento: Proyecto | ✅ RF-12 |
| Empresa: Cliente (`scopeProjects` en `companyIndicators.ts`) | ✅ RF-12 |
| Colores del botón (`statusFilterTriggerClass`, `attributeTypeTriggerClass`, alerta, salud) | ✅ RF-7: `ComboFilter` los usa solo con un único elegido |
| Restablecer filtros (conteo y link) | ➖ no aplica: cuenta filtros activos, no valores |
| Buscar (`SearchBox` hiddenParams), filtros guardados en cookie, `calendarHref`/`filterHref` | ➖ no aplica: pasan el valor como texto, sin interpretarlo |
| Links con un valor: `TagChip`, Agenda → proyecto (`?risk=`, `?status=`), notificaciones, asistente, bot (`fileTask`) | ➖ no aplica: un valor sigue siendo válido (RF-13) |
| API v1, chat/bot, WhatsApp, resúmenes, tareas programadas | ➖ no aplica: no leen estos filtros de la URL |
| Permisos | ➖ no cambian: cada pantalla sigue acotando a lo visible antes de filtrar; Agenda deja de abrir agendas ajenas (RF-11) |

## Archivos

- **Nuevo `src/lib/multiFilter.ts`** (sin "use client", lo usan servidor y cliente): `parseMultiFilter`, `serializeMultiFilter`, `matchesMultiFilter(raw, test)` (al menos un elegido cumple y ningún oculto cumple), `multiFilterIncludes(raw, id)`, `singleIncluded(raw)`. Chequeo ejecutable `scripts/verify-multi-filter.ts`.
- **`src/components/icons.tsx`**: `MinusIcon` con el trazo de `PlusIcon`.
- **`ComboFilter.tsx`**: lee el valor como lista; clic en nombre = solo ese; botones +/− y ojo (`title` «Agregar», «Quitar», «Ocultar», «Mostrar»); fila elegida con fondo y `CheckIcon`; oculta tachada y gris; texto del botón (RF-7); prop `single` por opción (Archivadas) y opciones fijas (Todos los proyectos) conservan los ocultos.
- **Páginas**: cada filtro pasa a `matchesMultiFilter(valor, v => <regla actual de un solo valor>)`. Las reglas existentes (`matchesAssigneeFilter`, `matchesStatusFilter`, `matchesTagFilter`, `matchesRiskFilter`, tipo, `expandProjectFilter`) se reutilizan tal cual como prueba de un valor.
- **Agenda**: siempre tareas propias; se quitan `viewingOther`/`effectiveUserId`/`scopedProjectIds`; Persona con las otras personas de mis tareas, visible para todos.
- **Rendimiento**: proyectos permitidos filtrados por la lista. **Empresa**: `scopeProjects` con elegidos (`in`) y ocultos (`notIn`, sin perder proyectos sin cliente).

## Formato en la URL

`?userId=a,b,!c` — separados por coma, oculto con `!`. Los ids (cuid, enums, `cat:…`) nunca llevan coma ni `!`. Un valor suelto es lo mismo que hoy.

## Descartado

- Un parámetro aparte para ocultos (`?userIdHide=`): duplica cada filtro en ~40 armados de URL. Un solo parámetro no toca esos armados.

## Verificación

`npx tsc --noEmit`, `npm run lint`, `npx tsx scripts/verify-multi-filter.ts`. Visual: sin probar hasta que se autorice el navegador.
