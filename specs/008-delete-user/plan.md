# Plan 008 — Eliminar un usuario de forma definitiva

## Inventario de impacto

La entidad que cambia es el usuario: aparece un estado nuevo, «eliminado». Una cuenta eliminada queda además inactiva, sin teléfono y sin correo, así que todo lo que ya filtra por cuenta activa o por teléfono la excluye sin tocarlo.

| Consumidor | Dónde | Estado |
|---|---|---|
| Lista de usuarios de Configuración (activos e inactivos) | `settings/page.tsx`, `UsersAdmin.tsx` | ✅ se ajusta: excluye eliminados; botones «Desactivar» y «Eliminar definitivamente» (RF-1, RF-2, RF-20) |
| Acciones sobre un usuario (rol, clave, perfil, foto, desactivar, reactivar) | `settings/actions.ts` | ✅ se ajusta: rechazan una cuenta eliminada (RF-21) |
| Inicio de sesión web, API y link «Conectar IA» | `auth.ts`, `apiAuth.ts` | ➖ no aplica: ya exigen cuenta activa; además la clave queda inutilizable |
| Recuperar clave por WhatsApp | `login/forgotActions.ts` | ➖ no aplica: busca por usuario o correo, que quedan liberados, y exige teléfono |
| Selectores de asignar, revisores, PM, filtros por persona | páginas de proyecto, tarea, Proyectos, Archivados, Agenda, Colisiones | ➖ no aplica: ya listan solo activos |
| Menciones en comentarios y en hilos | `internalMessageActions.ts`, `threadsApi.ts`, `InternalConversation.tsx` | ➖ no aplica: ya exigen cuenta activa |
| Rendimiento individual y carga de equipo | `delays.ts` (`getUserPerformance`, `getTeamWorkload`), `reviewPerformance.ts` | ✅ se ajusta: hoy listan a todos los usuarios sin filtrar; excluyen eliminados (RF-20) |
| Selector de persona en Rendimiento | `performance/page.tsx` | ➖ no aplica: solo activos |
| Contraseñas: acceso, audiencia de avisos, selector de personas | `credentials.ts`, `credentials/actions.ts` | ✅ se ajusta: la reasignación traspasa creador y accesos (RF-12, RF-13); las listas ya son de activos |
| Historial de acceso a contraseñas | `CredentialAccessLog` | ➖ no aplica: conserva la fila, firmada «Usuario eliminado» (RF-18) |
| Comentarios internos, mensajes y rondas de revisión, archivos, links compartidos, votos | varias tablas | ➖ no aplica: no se tocan; muestran el nombre de la cuenta, que pasa a «Usuario eliminado» (RF-18) |
| Buscador del header | `api/search/route.ts` | ➖ no aplica: muestra nombres desde las mismas relaciones |
| Chat del bot | `chontatecTools.ts` (`list_team_members`, envíos) | ➖ no aplica: solo activos. No se agrega herramienta para eliminar usuarios |
| API v1 | `api/v1/users` | ➖ no aplica: solo activos. No se expone la eliminación por API |
| WhatsApp directo, menciones en grupo, cola de alertas | `whatsapp.ts`, `notifications.ts` | ➖ no aplica: buscan por teléfono o por cuenta activa, y ambos quedan vacíos |
| Resumen diario | `notifications.ts` | ➖ no aplica: solo activos |
| Avisos dentro de la app | `Notification` | ✅ se ajusta: se borran los de la persona (RF-17) y se crea uno por quien recibe (RF-15) |
| Avisos del navegador y Google Calendar | `PushSubscription`, `GoogleCalendarConnection` | ✅ se ajusta: se borran (RF-16) |
| Exportar e importar respaldo | `api/export`, `api/import` | ✅ se ajusta: el respaldo lleva la marca de eliminado para que al restaurar siga oculta |
| Caché de estado de sesión | `forgetUserStatus` | ✅ se ajusta: se limpia al eliminar |
| Registro de la app | `logger.ts` | ✅ se ajusta: una línea con quién eliminó y a quién se reasignó (RNF-3) |

## Partes

### P1. Dato nuevo — RF-16, RF-20, RF-21
- `prisma/schema.prisma`: `User.deletedAt DateTime?`. Migración `add_user_deleted_at`, que corre dentro de `npm run build`. No toca filas existentes.
- Descartado: borrar la fila. Cinco relaciones la exigen (PM, quien envió una ronda, autor de mensaje de revisión, quien subió un adjunto de ajuste, quien creó un link compartido) y los comentarios internos se borrarían en cascada.

### P2. Lógica central — RF-4 a RF-19, RF-22
Nuevo `src/lib/userDeletion.ts`, sin `"use server"`:
- `getUserDeletionSummary(userId)`: cuenta proyectos como PM, tareas vigentes (asignada o revisora, no completadas ni archivadas, proyecto no archivado) y contraseñas (creadas + accesos por «Personas concretas»).
- `deleteUserPermanently({ userId, actorId, newPmId, tasksToId, credentialsToId })`, todo dentro de una sola transacción:

```
validar: existe, no eliminada, no es el actor; destinos activos y distintos de la persona
si es PM de algún proyecto y falta newPmId → error
proyectos: pmId → newPmId
tareas vigentes:
  con destino → borrar filas donde el destino ya tiene ese papel; el resto cambia de persona
  sin destino → borrar sus filas de asignada y revisora en tareas vigentes
contraseñas:
  con destino → creador pasa al destino; accesos: borrar donde el destino ya lo tiene, el resto cambia de persona
  sin destino → borrar las «Solo yo» que creó; las demás quedan sin creador; borrar sus accesos
borrar lo personal: notificaciones, avisos del navegador, Google Calendar, chat del bot,
  marcas de lectura, menciones recibidas, links «Conectar IA», días de actividad
cuenta: nombre «Usuario eliminado», usuario «eliminado-<id>», correo, teléfono y foto vacíos,
  clave inutilizable, rol miembro, inactiva, deletedAt = ahora, tokens vacíos
un aviso por cada persona que recibe
```
- Fuera de la transacción: borrar el archivo de la foto con `deleteFileIfUnused`, limpiar la caché de sesión y escribir la línea en el registro.
- Reutiliza: `deleteFileIfUnused`, `forgetUserStatus`, `logger`, `LIVE_PROJECT_WHERE`. Desde cero: el módulo, porque no existe ninguna reasignación en bloque.

### P3. Acciones del servidor — RF-3, RF-21
- `settings/actions.ts`: `getUserDeletionSummaryAction` y `deleteUserPermanentlyAction`, con `requireAdmin`, validación de entrada y actor tomado de la sesión, nunca de un parámetro.
- Las acciones existentes sobre un usuario rechazan una cuenta eliminada.

### P4. Interfaz — RF-1, RF-2, RF-4 a RF-9
- `UsersAdmin.tsx`: el botón actual pasa a llamarse «Desactivar» (su confirmación deja de decir «Eliminar»); botón nuevo «Eliminar definitivamente», también en la lista de inactivos.
- Formulario en `ModalShell`: conteos, hasta tres selectores (solo los que aplican) con las personas activas, y confirmación final con `useConfirm` en modo peligro.
- Reutiliza: `ModalShell`, `useConfirm`, `useToast` y el selector buscable de personas que ya exista en el proyecto.

### P5. Listados que hoy no filtran — RF-20
- `delays.ts` (`getUserPerformance`, `getTeamWorkload`) y `reviewPerformance.ts`: excluyen cuentas eliminadas.
- `settings/page.tsx`: la lista de usuarios excluye eliminadas.

### P6. Respaldo
- `api/export` y `api/import`: llevan y restauran `deletedAt`.

## Decisiones técnicas

- **Aviso a quien recibe, sin nombre:** «Recibió N tareas y M contraseñas de una cuenta eliminada.» Nombrar a la persona dejaría su nombre guardado en un aviso, contra lo que pide la eliminación.
- **Nombre escrito dentro de comentarios antiguos:** si alguien escribió «@Juan» en un comentario, ese texto no se reescribe. Limitación conocida; se borran las menciones como vínculo, no el texto.
- **Tareas completadas:** conservan a la persona como asignada, mostrada como «Usuario eliminado».

## Verificación

- `npx tsc --noEmit`, `npm run lint`.
- Nuevo `npm run verify:delete-user` (contra la base local, crea y limpia sus propios datos): reasignación de tareas con y sin duplicado, de contraseñas incluida una «Solo yo», de PM; caso «No reasignar»; historial intacto (un comentario y una ronda de la persona siguen existiendo); cuenta vacía de datos; error a mitad no deja cambios.
- `npm run verify:credentials` y `npm run verify:subprojects` siguen pasando.
- Prueba visual del formulario: solo con autorización del navegador.
