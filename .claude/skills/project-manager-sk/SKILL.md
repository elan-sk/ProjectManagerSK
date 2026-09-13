---
name: project-manager-sk
description: Consultar, crear y modificar proyectos, cronogramas y tareas en la API de ProjectManagerSK (este mismo repo). Usar cuando el usuario pida ver el estado de un proyecto, crear tareas, mover el estado de una tarea, gestionar asignados/revisores, cronograma, etiquetas, la revisión/QA de una tarea, o preguntar por atrasos/cuellos de botella.
---

# ProjectManagerSK API

API REST del propio sistema de gestión de proyectos (Next.js + Prisma, este repo).

## URL del servidor — nunca hardcodear `localhost`

Todavía no hay un dominio de producción fijo (el proyecto sigue en desarrollo local, va a pasar a un hosting real más adelante), así que la URL se resuelve así, en este orden:

1. **Caché local**: si existe el archivo `.claude/skills/project-manager-sk/.cached-base-url` en este repo, usá el valor de ahí como `BASE_URL` — no preguntes de nuevo mientras siga funcionando.
2. **`.env` de la raíz del proyecto**: si no hay caché todavía, fijate si `NEXTAUTH_URL` está definida ahí (la app la usa para sus propios links) y proponésela a la persona como valor por defecto.
3. **Preguntar**: si no hay ni caché ni `.env`, o la persona quiere cambiarla, preguntale directamente "¿en qué URL está corriendo ProjectManagerSK?" (con el valor de `.env` como sugerencia si lo encontraste). Guardá lo que responda en `.cached-base-url` (texto plano, solo la URL — a diferencia del usuario/contraseña/token, esto no es secreto, así que sí se puede guardar en disco).
4. **Si un llamado falla por conexión** (timeout, connection refused — no un 401/403/404, esos son respuestas válidas del servidor) con la URL cacheada: asumí que el servidor se movió, volvé a preguntar la URL, y sobrescribí `.cached-base-url` con la nueva.

```bash
BASE_URL=$(cat .claude/skills/project-manager-sk/.cached-base-url 2>/dev/null)
```

Si `.cached-base-url` no existe todavía, creá el archivo (y agregalo a `.gitignore` si no está) la primera vez que la persona te confirme la URL.

## Autenticación — login por usuario/contraseña, NUNCA una clave guardada

Esta skill se comparte entre todo el equipo, así que **no hay ninguna credencial grabada en su configuración**. Cada vez que haga falta hablar con la API en una conversación nueva (no hay todavía un token vigente en esta sesión):

1. Pedile a la persona su usuario (o correo) y contraseña de ProjectManagerSK — las mismas con las que entra a la app web. Nunca los adivines ni los tomes de un archivo.
2. Hacé login:
   ```bash
   curl -s "$BASE_URL/api/v1/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"identifier": "usuario_o_correo", "password": "..."}'
   ```
   Devuelve `{ token, expiresAt, user: { id, name, username, role } }`.
3. Usá ese `token` en el header `Authorization: Bearer <token>` para el resto de los llamados de esa conversación.
4. El token dura 8 horas y representa a ESA persona con SU rol real — la API aplica exactamente los mismos permisos que la app web (ver más abajo, "Permisos"). Un login nuevo invalida cualquier sesión anterior de esa misma persona.
5. **Nunca** escribas el usuario, la contraseña, ni el token en un archivo de esta skill, config, o cualquier lugar persistente — solo mantenelos en memoria mientras dure la conversación. Si la conversación termina y hace falta la API de nuevo, volvé a pedir el login.

## Permisos (importante para no ofrecer una acción que va a fallar)

La API no tiene un modo "todo permitido" — cada operación exige lo mismo que exige la app web para esa misma persona:

- **Cualquier usuario logueado**: ver proyectos/tareas, crear un proyecto.
- **PM del proyecto o administrador**: crear/borrar tareas, fases, objetivos, requisitos, links del proyecto; mover fechas (mover/redimensionar tarea o grupo); reasignar el PM del proyecto.
- **Asignado a la tarea, PM del proyecto, o administrador** (`canEditTask`): editar título/descripción/fase/link de reunión, cambiar asignados, checklist de pasos, etiquetas.
- **Revisor de la tarea (tipo Prueba/QA), PM del proyecto, o administrador** (`canReviewTask`): calificar pruebas, cerrar ronda, completar la revisión.
- Un asignado a una tarea **nunca** puede ser también su revisor (regla dura, sin excepción de rol).

Si una llamada devuelve **403**, es un problema de permiso real (avisale a la persona qué rol hace falta) — no reintentes con otro método.

## Endpoints

### Proyectos

- `GET /api/v1/projects` — lista todos los proyectos (con PM y fases).
- `POST /api/v1/projects` — crea un proyecto.
  ```json
  { "name": "string", "clientName": "string?", "startDate": "2026-09-07", "pmId": "string" }
  ```
- `GET /api/v1/projects/:id` — detalle completo: fases, tareas con asignados, más `bottlenecks` (cuellos de botella) y `delays` (atrasos por tarea, ver regla abajo).
- `PATCH /api/v1/projects/:id` — descripción, fecha objetivo, cliente, repo, color. Requiere PM/admin.
- `POST /api/v1/projects/:id/reassign-pm` — `{ "pmId": "string" }`. Requiere PM/admin.
- `POST /api/v1/projects/:id/move-group` — mueve varias tareas el mismo delta de días hábiles: `{ "taskIds": ["..."], "deltaDays": 2 }`. Requiere PM/admin.

#### Definición del proyecto

Pensada para volcar acá lo que ya se armó en otra conversación (contexto, actas de reunión transcritas, documentos que definen el proyecto): creá el proyecto, después objetivos/fases/requisitos, y los archivos de contexto como adjuntos. Todo esto se puede volver a editar después — típicamente cuando el cliente pide una contingencia y hay que reformular alcance a mitad de proyecto.

- `POST /api/v1/projects/:id/phases` — `{ "name": "string" }`.
- `PATCH /api/v1/projects/:id/phases/:phaseId` — `{ "name": "string", "requirementIds": ["..."] }`.
- `DELETE /api/v1/projects/:id/phases/:phaseId` — falla (409) si la fase todavía tiene tareas; movelas o borralas primero.
- `POST /api/v1/projects/:id/objectives` — `{ "title": "string", "description": "string?" }`.
- `PATCH /api/v1/projects/:id/objectives/:objectiveId` / `DELETE .../:objectiveId`.
- `POST /api/v1/projects/:id/requirements` — `{ "title": "string", "description": "string?", "objectiveIds": ["..."], "phaseIds": ["..."] }`.
- `PATCH /api/v1/projects/:id/requirements/:requirementId` (mismo body que crear, reemplaza `objectiveIds`) / `DELETE .../:requirementId`.
- `GET/POST /api/v1/projects/:id/links` — `{ "title": "string", "url": "https://..." }`. Para lo que puede vivir afuera (Drive, Figma, repo) — se prioriza sobre subir el archivo.

Todas requieren PM/admin.

#### Archivos del proyecto (adjuntos reales, no links)

Dos pasos — primero subir el archivo, después adjuntarlo:

1. `POST /api/upload` — `multipart/form-data` con campo `file` (mismo `Authorization: Bearer <token>`, sin `Content-Type` manual — dejá que curl/fetch lo arme con el boundary). Imagen, PDF, Word, Excel, PowerPoint o texto/CSV; máximo 20MB. Devuelve `{ url, name, mimeType }`.
   ```bash
   curl -s "$BASE_URL/api/upload" -H "Authorization: Bearer $TOKEN" -F "file=@/ruta/al/archivo.pdf"
   ```
2. `GET/POST /api/v1/projects/:id/attachments` — con el `{ url, name, mimeType }` del paso anterior. Requiere PM/admin.
3. `DELETE /api/v1/projects/:id/attachments/:attachmentId` — Requiere PM/admin.

### Tareas

- `GET /api/v1/projects/:id/tasks` — lista las tareas de un proyecto.
- `POST /api/v1/projects/:id/tasks` — crea una tarea. Requiere PM/admin.
  ```json
  {
    "phaseId": "string",
    "title": "string",
    "type": "SIMPLE | MILESTONE | QA | ADJUSTMENT",
    "description": "string?",
    "meetingUrl": "https://...?",
    "plannedStart": "2026-09-07",
    "durationDays": 3,
    "assigneeIds": ["userId"],
    "dependsOnTaskIds": ["taskId"],
    "reviewerIds": ["userId"],
    "defaultTestTemplateId": "string?"
  }
  ```
  `plannedEnd` se calcula solo en días hábiles (festivos del país del proyecto vía Nager.Date). `reviewerIds`/`defaultTestTemplateId` solo aplican con `type: "QA"` — y ningún id puede repetirse entre `assigneeIds` y `reviewerIds` (409 si se repite).
- `GET /api/v1/tasks/:id` — detalle de una tarea, incluye `delayDays` si está completada.
- `PATCH /api/v1/tasks/:id` — estado, título, descripción, fase, link de reunión, riesgo. Requiere ser asignado/PM/admin.
  ```json
  { "status": "NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETED | RETURNED" }
  ```
  El cambio de estado corre las MISMAS reglas que la app web: checklist de pasos completo, evidencia cargada (Entregable), cambios respondidos (Ajuste), ronda de revisión aprobada (Prueba), "Devuelta" no se puede tocar a mano, y solo PM/admin puede reabrir una tarea ya completada o devolverla a "Sin iniciar". Cualquier violación → **409** con el motivo.
- `DELETE /api/v1/tasks/:id` — borra la tarea. Requiere PM/admin.

#### Cronograma (fechas y dependencias)

- `POST /api/v1/tasks/:id/move` — mueve el cuerpo completo de la barra: `{ "newStartDate": "2026-09-10", "expectedUpdatedAt": "...?" }`. Solo tareas que no iniciaron. Requiere PM/admin.
- `POST /api/v1/tasks/:id/resize` — mueve un extremo: `{ "edge": "start" | "end", "newDate": "..." }`. Requiere PM/admin.
- `GET/POST /api/v1/tasks/:id/dependencies` — `{ "predecessorId": "taskId", "type": "FINISH_TO_START | START_TO_START" }`. Requiere PM/admin.
- `DELETE /api/v1/tasks/:id/dependencies/:dependencyId` — Requiere PM/admin.

`expectedUpdatedAt` (el `updatedAt` de la tarea al leerla) es opcional pero recomendado — si alguien más la cambió mientras tanto, la llamada rechaza en vez de pisar ese cambio.

#### Asignados, revisores, checklist, etiquetas

- `PATCH /api/v1/tasks/:id/assignees` — `{ "assigneeIds": ["userId"] }`. Reemplaza la lista completa.
- `PATCH /api/v1/tasks/:id/reviewers` — `{ "reviewerIds": ["userId"] }`. Solo tiene efecto real en tareas tipo Prueba/QA.
- `GET/POST /api/v1/tasks/:id/steps` — `{ "description": "string" }`.
- `PATCH /api/v1/tasks/:id/steps/:stepId` — `{ "done": true }`.
- `GET /api/v1/tags` — lista las categorías de etiqueta disponibles (id, name, colorHex, emoji).
- `GET/POST /api/v1/tasks/:id/tags` — `{ "categoryId": "string", "name": "string" }`. Una etiqueta por categoría en cada tarea (reemplaza si ya había una de esa categoría); si el nombre no existe todavía en el proyecto bajo esa categoría, se crea solo.
- `DELETE /api/v1/tasks/:id/tags/:taskTagId` — quita la etiqueta.

### Revisión / QA (solo tareas `type: "QA"`)

Flujo: se envía una ronda (con entregables) → el revisor califica cada prueba → cierra la ronda (aprobada, o devuelta si algo quedó "Con errores") → si aprobó, se completa.

- `POST /api/v1/tasks/:id/review/rounds` — envía o reenvía una ronda:
  ```json
  { "deliverables": [{ "id": "string?", "name": "string", "url": "string", "mimeType": "string" }] }
  ```
  Al reenviar (ronda 2+, tras una devolución), pasá el `id` de un entregable de la ronda anterior para actualizarlo en el mismo lugar en vez de duplicarlo; omitilo para un entregable nuevo. Exige que todas las pruebas "Con errores" de la ronda anterior ya tengan respuesta + evidencia de corrección.
- `PATCH /api/v1/tasks/:id/review/checks/:checkId/result` — califica una prueba: `{ "result": "APPROVED | FLAGGED | FAILED | NOT_APPLICABLE", "note": "string?" }`. Calificar `FAILED`/`FLAGGED` exige que la prueba ya tenga evidencia cargada (409 si no).
- `POST /api/v1/tasks/:id/review/checks/:checkId/revert` — revierte una calificación a blanco. Solo mientras la ronda siga abierta.
- `POST /api/v1/tasks/:id/review/rounds/:roundId/close` — cierra la ronda (exige que todas las pruebas tengan resultado). Si alguna quedó "Con errores", la tarea pasa a "Devuelta".
- `POST /api/v1/tasks/:id/review/complete` — completa la tarea de Prueba (exige última ronda aprobada).

## Regla de atrasos (importante para no malinterpretar `delays`)

Una tarea solo aparece en `delays` si **su propia duración real** superó la planeada — no por haber arrancado tarde porque una tarea de la que dependía se demoró. Si el usuario pregunta "¿quién generó el atraso?", la respuesta está en este campo, no en comparar fechas de fin a simple vista.

## No cubierto todavía por la API

Estas acciones solo se pueden hacer desde la app web por ahora — decíselo a la persona si las pide:
- Insumos/evidencia (adjuntos) de una TAREA (los del proyecto sí están cubiertos, ver arriba).
- Ítems de una tarea tipo Ajuste (antes/después).
- Subir un archivo binario como evidencia de revisión (sí se puede mandar un link: agregalo como `deliverable` con la URL, o subilo con `POST /api/upload` y usá esa `url`).
- Mensajes del hilo de una ronda de revisión, aplicar plantilla de pruebas, agregar/quitar una prueba suelta a mano.
- Plantillas de Pruebas y categorías de respuesta (Configuración).

## Ejemplo (curl) — URL + login + una llamada

```bash
BASE_URL=$(cat .claude/skills/project-manager-sk/.cached-base-url 2>/dev/null)
# (si no existe todavía, resolvela primero como dice la sección de arriba)

TOKEN=$(curl -s "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier": "usuario_o_correo", "password": "la_contraseña"}' | jq -r .token)

curl -s "$BASE_URL/api/v1/projects" -H "Authorization: Bearer $TOKEN"
```
