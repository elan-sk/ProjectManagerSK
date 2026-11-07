# Plan 018 — Rol «Coordinador»

Diagrama: [change-diagram.png](change-diagram.png)

## Inventario de impacto

| Consumidor | Estado | RF |
|---|---|---|
| `enum Role` (schema) + migración | ✅ se agrega `COORDINATOR`; `Project.createdById` (relación a User, `onDelete: SetNull`) | RF-1, RF-4 |
| Migración de datos: Miembros con proyectos como PM → `COORDINATOR` | ✅ SQL en la misma migración | RF-10 |
| Configuración → crear usuario (`CreateUserForm`) y cambiar rol (`UsersAdmin`, `settings/actions.ts`) | ✅ opción «Coordinador» y zod | RF-1, RF-11 |
| Importación (`api/import/route.ts`) | ✅ enum acepta `COORDINATOR` | RF-11 |
| Crear proyecto: formulario (`projects/actions.ts createProject`) | ✅ control + `createdById` | RF-2, RF-4 |
| Crear proyecto: API (`api/v1/projects POST`) | ✅ control (403) + `createdById` | RF-2, RF-4 |
| Crear proyecto: bot (`create_project` en `chontatecTools.ts`) | ✅ control + `createdById` | RF-2, RF-4 |
| Asistente de proyectos (`canUseProjectAssistant` sin proyecto) | ✅ = puede crear proyectos | RF-2, RF-3 |
| Botón «+ Nuevo proyecto» y del asistente (`ProjectSummaryGrid`, `projects/page.tsx`) | ✅ solo si puede crear | RF-3 |
| Botón «+ Nuevo subproyecto» (`SubprojectsPanel`) | ✅ `canManage` y puede crear | RF-2, RF-3 |
| Cambiar PM: acción `reassignPM` (botón «Cambiar» del PM en la ficha del proyecto + `api/v1/projects/[id]/reassign-pm`) | ✅ admin o Coordinador creador; botón visible solo para ellos | RF-5 |
| Proyectos archivados (`archived/page.tsx`) | ➖ ya oculta el botón de crear | — |
| Clientes: creación por nombre (`clientFieldsFor` → formulario, definición del proyecto, API, bot) | ✅ un solo control dentro de `clientFieldsFor` | RF-7, RF-8 |
| Clientes: `canCreateClients` (bot `save_client` para cliente nuevo) | ✅ admin o Coordinador | RF-8 |
| Selector «Cliente» (`listClientOptions`) | ✅ Coordinador ve todos los nombres | RF-7 |
| Ficha de cliente, Empresa, configuración, usuarios, rendimiento, aprendizajes de empresa, proyectos ocultos | ➖ ya exigen `role === "ADMIN"`; el Coordinador no es admin | RF-9 |
| Permisos derivados de ser PM (`isPmOrAdminAnywhere`, `isReviewerAnywhere`, `getProjectAdmin`) | ➖ siguen por `pmId`, no por rol | RF-6 |
| Bot: texto de identidad («rol administrador / PM / miembro») y regla de quién crea proyectos (`chontatec.ts`) | ✅ nombra «coordinador» y la regla nueva | RF-3 |
| WhatsApp, notificaciones, resumen diario, colas, tareas programadas | ➖ no dependen del rol ni de quién crea proyectos | — |
| Exportación/backup | ➖ copian tablas completas; la columna nueva va sola | — |
| Borrado de usuario (`userDeletion.ts`) | ➖ `onDelete: SetNull` deja el creador vacío | — |

## Archivos

- `prisma/schema.prisma` + `prisma/migrations/<fecha>_coordinator_role/migration.sql`.
- `src/lib/permissions.ts`: `canCreateProjects(user)` (ADMIN o COORDINATOR) y `canReassignPm(user, project)`; se reutilizan en todas las puertas.
- `src/lib/clients.ts`: `canCreateClients` por rol; `clientFieldsFor` rechaza crear si no puede; `clientPickerWhere` para el selector.
- Puertas: `projects/actions.ts`, `api/v1/projects/route.ts`, `chontatecTools.ts`, `projectAssistant.ts`, `projects/page.tsx`, `ProjectSummaryGrid.tsx` (ya recibe `showCreateButton`), `projects/[id]/page.tsx` + `SubprojectsPanel.tsx`, `projects/[id]/actions.ts` (`reassignPM`).
- Usuarios: `CreateUserForm.tsx`, `UsersAdmin.tsx`, `settings/actions.ts`, `api/import/route.ts`.
- Bot: `chontatec.ts`.

Nada se construye desde cero: se reutilizan `getProjectAdmin`, `trustedActor`, `newSubprojectParentError` y el selector de clientes existente.

## Lógica

```
canCreateProjects(u) = u.role in [ADMIN, COORDINATOR]
canReassignPm(u, p)  = u.role == ADMIN || (u.role == COORDINATOR && p.createdById == u.id)
clientFieldsFor(name): si no existe cliente con ese nombre y !canCreateClients(u) → error «Solo un administrador o un coordinador puede crear clientes nuevos.»
```

Mensaje al Miembro que intenta crear: «Crear proyectos es solo para coordinadores y administradores.»

## Decisiones técnicas

- Rol en el enum (no un booleano aparte): la UI pide un selector de tres niveles y así queda un único dato.
- `createdById` con relación y `SetNull` en vez de texto suelto: la base mantiene la integridad sola.

## Verificación

- `npx prisma migrate dev` en local y `npx prisma generate`.
- `npx tsc --noEmit` y `npx eslint` de los archivos tocados.
- Script `scripts/verify-coordinator-role.mts`, que corre las funciones de permiso contra usuarios de prueba en la base local: Miembro no crea proyecto ni cliente, Coordinador sí, cambio de PM solo admin o creador. Se borra lo que crea.
- Sin navegador (no autorizado): quedan sin probar visualmente los botones ocultos y la opción del selector.
