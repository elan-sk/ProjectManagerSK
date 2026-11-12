---
name: project-manager-sk
description: Consultar, crear y modificar proyectos, cronogramas y tareas en la API de ProjectManagerSK (este mismo repo). Usar cuando el usuario pida ver el estado de un proyecto, crear tareas, mover el estado de una tarea, gestionar asignados/revisores, cronograma, etiquetas, la revisión/QA de una tarea, o preguntar por atrasos/cuellos de botella. También para DISEÑAR y subir Ajustes, Pruebas (QA) y Aceptaciones (cambios pedidos, pruebas o características, con imágenes y archivos), publicar comentarios, menciones y preguntas de selección en cualquier hilo, y crear el link para compartir con el cliente.
---

# ProjectManagerSK API

API REST del propio sistema de gestión de proyectos (Next.js + Prisma, este repo).

## Conexión: URL, login y link «Conectar IA» → skill `pmsk`

La URL del servidor (producción `https://pmsk.depura-creatividad.com`), el login con el archivo `.pmsk.env` y el uso del link «Conectar IA» están en la skill `pmsk`, que es la única fuente para eso: no se repiten acá para que no se contradigan. Con el token, todos los llamados de abajo van con `Authorization: Bearer <token>` y los permisos reales de la persona.

## Permisos (importante para no ofrecer una acción que va a fallar)

La API no tiene un modo "todo permitido" — cada operación exige lo mismo que exige la app web para esa misma persona. **PM del proyecto** = quien figura como PM, quien creó el proyecto o el PM (o creador) de su proyecto principal (regla única `managedProjectWhere`, 2026-11-09); «PM de algún proyecto» usa la misma regla (`isPmAnywhere`).

- **Cualquier usuario logueado**: ver los proyectos y tareas donde participa.
- **Crear proyectos, subproyectos y clientes nuevos**: administrador o Coordinador (`canCreateProjects`, `canCreateClients`); un Miembro nunca, aunque sea PM. **Cambiar el PM**: administrador o el Coordinador que creó el proyecto (`canReassignPm`). Editar o eliminar la ficha de un cliente existente: solo administrador.
- **PM del proyecto o administrador**: crear/borrar tareas, fases, objetivos, requisitos, links del proyecto; mover fechas (mover/redimensionar tarea o grupo); crear y renombrar etiquetas del proyecto (`POST /api/v1/tags`, `PATCH /api/v1/tags/:id`; eliminar una etiqueta, solo administrador).
- **Responsable de la tarea, PM del proyecto, o administrador** (`canEditTask`): editar título/descripción/fase/link de reunión, cambiar responsables, checklist de pasos, etiquetas de la tarea.
- **Revisor de la tarea (tipo Prueba/QA), PM del proyecto, o administrador** (`canReviewTask`): calificar pruebas, cerrar ronda, completar la revisión.
- Un responsable de una tarea **nunca** puede ser también su revisor (regla dura, sin excepción de rol).
- **Diseñar Ajustes y Aceptaciones** (cambios, características, entregables, evidencias): responsable, PM del proyecto o administrador (`canEditTask`). **Diseñar Pruebas** (agregar pruebas a la ronda, plantilla): revisor, PM o administrador (`canReviewTask`); crear la primera ronda (= enviar a revisión) exige además poder editar la tarea: responsable, PM o administrador.
- **Gestionar plantillas de pruebas** (crear, renombrar, agregar o editar ítems) — en la web (Configuración → Pruebas), por API y desde el chat (`manage_test_template`), misma regla: revisor (en al menos una tarea de cualquier proyecto), PM de algún proyecto o administrador (`isReviewerAnywhere`); borrar plantilla o ítem, solo administrador. Un miembro sin eso solo las ve en la web y por API recibe 403 en todo, incluso al listar. Misma regla para las categorías de respuesta (esas solo se gestionan en la web).
- **Contraseñas del proyecto**: agregarlas, cualquier miembro del proyecto (responsable o revisor de al menos una tarea), PM o administrador (`isProjectMember`); editarlas o borrarlas, quien la creó, el PM o un administrador.
- **Comentar y responder preguntas**: quien edita o revisa la tarea; en la conversación del proyecto o la Definición, quien participa en el proyecto (PM, administrador, o responsable/revisor de alguna tarea). **Cerrar una pregunta**: quien la publicó, quien edita la tarea, o el PM/administrador.
- **Link compartido y «Conectar IA»**: de una tarea, su responsable, su revisor, el PM o un administrador (`canShareTask`); del proyecto entero, solo PM/administrador.
- Para subir un diseño, la persona que inicia sesión tiene que tener ese rol: la API no tiene clave maestra ni permisos propios.

Si una llamada devuelve **403**, es un problema de permiso real (avisale a la persona qué rol hace falta) — no reintentes con otro método.

## Endpoints

### Proyectos

- `GET /api/v1/projects` — lista los proyectos del flujo normal (con PM y fases). `GET /api/v1/projects?archived=1` — el historial de **archivados** (proyectos entregados/terminados; no aparecen en la lista normal, buscador, agenda, reportes ni alertas).
- `POST /api/v1/projects` — crea un proyecto.
  ```json
  { "name": "string", "clientName": "string?", "startDate": "2026-09-07", "pmId": "string", "parentId": "string?" }
  ```
  `parentId` lo crea ya como **subproyecto** de ese proyecto principal (exige ser PM del principal o admin; el principal no puede ser a su vez subproyecto).
- `GET /api/v1/projects/:id` — detalle completo: fases, objetivos, requerimientos, adjuntos, links, repos, tareas con asignados y todos sus archivos (insumos/resultados, antes/después/insumos de ajustes, entregables y evidencias de rondas), `parent` (principal, si es subproyecto) y `children` (subproyectos, si es principal), más `bottlenecks` (cuellos de botella), `delays` (atrasos por tarea, ver regla abajo) y `schedule`: `{ projectedEnd, targetEndDate, varianceBusinessDays (+ holgura / − retraso, null sin fecha de cierre), label, delayingTasks }` — cuándo terminaría el proyecto si sigue al ritmo actual (tarea en curso vencida = hoy + su duración; sin iniciar con inicio pasado = arranca hoy; se corren sus sucesoras).
- `PATCH /api/v1/projects/:id` — todo lo que se edita en la app. Requiere PM/admin. Campos (todos opcionales; `null` vacía uno opcional):
  `name`, `description` (HTML), `startDate`, `targetEndDate`, `clientName`, `repoUrl`, `color`, `iconUrl` (url de `/api/upload`), `whatsappGroupJid`,
  `archived: true|false` (archivar/desarchivar: lo manda al historial o lo devuelve; PM o admin),
  `hidden: true|false` (ocultar/mostrar: solo el administrador que además es PM del proyecto o de su principal),
  `parentId: "id" | null` (subproyectos: vincula este proyecto como subproyecto de otro, o lo quita del grupo con `null`. Solo dos niveles: un subproyecto no tiene subproyectos y un principal no tiene principal. Vincular exige administrar los dos).
  Ocultar, archivar o eliminar un **principal** hace lo mismo con sus subproyectos. El PM del principal administra también sus subproyectos (al revés no).
- `DELETE /api/v1/projects/:id` — **elimina** el proyecto (solo administrador; desaparece para todos). Para un proyecto terminado usar `archived: true`, no esto.
- `DELETE /api/v1/projects/:id/links/:linkId` — quita un link de la Definición.
- `POST /api/v1/projects/:id/repos` — `{ "url" }` agrega un repositorio (el primero queda como principal). `DELETE /api/v1/projects/:id/repos?url=…` lo quita.
- `POST /api/v1/projects/:id/phases/reorder` — `{ "phaseIds": [...] }` con TODAS las fases en el orden nuevo.
- `POST /api/v1/projects/:id/tasks/merge` — `{ "taskIds": [2 o más], "title" }` combina tareas en una (no aplica a Prueba/Ajuste/Aceptación). Devuelve `{ id }`. **Revisar que la tarea combinada quede con las etiquetas del proyecto.**
- `POST /api/v1/projects/:id/reassign-pm` — `{ "pmId": "string" }`. Requiere PM/admin.
- `POST /api/v1/projects/:id/move-group` — mueve varias tareas el mismo delta de días hábiles: `{ "taskIds": ["..."], "deltaDays": 2 }`. Requiere PM/admin.

#### Definición del proyecto

Pensada para volcar acá lo que ya se armó en otra conversación (contexto, actas de reunión transcritas, documentos que definen el proyecto): creá el proyecto, después objetivos/fases/requisitos, y los archivos de contexto como adjuntos. Todo esto se puede volver a editar después — típicamente cuando el cliente pide una contingencia y hay que reformular alcance a mitad de proyecto.

- `POST /api/v1/projects/:id/phases` — `{ "name": "string" }`.
- `PATCH /api/v1/projects/:id/phases/:phaseId` — `{ "name": "string" }`. `requirementIds` es antiguo y opcional: los vínculos fase–requerimiento solo se tocan si se envía.
- `DELETE /api/v1/projects/:id/phases/:phaseId` — falla (409) si la fase todavía tiene tareas; movelas o borralas primero.
- `POST /api/v1/projects/:id/objectives` — `{ "title": "string", "description": "string?", "parentObjectiveId": "string?" }` (`parentObjectiveId`: en un subproyecto, objetivo del principal al que aporta; también en el PATCH, `null` lo desliga).
- `PATCH /api/v1/projects/:id/objectives/:objectiveId` / `DELETE .../:objectiveId`.
- `POST /api/v1/projects/:id/requirements` — `{ "title": "string", "description": "string?", "objectiveIds": ["..."] }`. El avance del requerimiento sale de las tareas que lo incluyen en `requirementIds`; `phaseIds` es antiguo y solo sirve de respaldo mientras el requerimiento no tenga tareas. **Avance ponderado (desde 2026-10-23):** el % de proyecto, fase, requerimiento y objetivo es un promedio ponderado por el trabajo: cada tarea pesa sus días hábiles planeados (lun–vie entre inicio y fin, mínimo 1), así una de 10 días aporta 10 veces lo que una de 1 día; nunca pasa de 100 %. No hay campo de complejidad: la duración es la medida (decisión del usuario: no llenar campos extra). Para estimar avance a mano, usar esta misma regla.
- `PATCH /api/v1/projects/:id/requirements/:requirementId` (mismo body que crear, reemplaza `objectiveIds`) / `DELETE .../:requirementId`.
- `GET/POST /api/v1/projects/:id/links` — `{ "title": "string", "url": "https://..." }`. Para lo que puede vivir afuera (Drive, Figma, repo) — se prioriza sobre subir el archivo.

Todas requieren PM/admin.

#### Archivos del proyecto (adjuntos reales, no links)

Dos pasos — primero subir el archivo, después adjuntarlo:

1. `POST /api/upload` — `multipart/form-data` con campo `file` (mismo `Authorization: Bearer <token>`, sin `Content-Type` manual — dejá que curl/fetch lo arme con el boundary). Imagen, PDF, Word, Excel, PowerPoint o texto/CSV/Markdown; máximo 20MB. Devuelve `{ url, name, mimeType }`.
   **Documentos de texto siempre en `.md`** (regla del usuario, 2026-10-01): todo documento que Claude redacte y suba a PMSK (specs, informes, actas, guías, notas, instructivos) va como `.md` — nunca `.txt` ni `.docx` generado. El visor de la app muestra `.md` con formato (títulos, listas, tablas). Los archivos que aporta la persona se suben tal como vienen, sin convertirlos.
   ```bash
   curl -s "$BASE_URL/api/upload" -H "Authorization: Bearer $TOKEN" -F "file=@/ruta/al/archivo.pdf"
   ```
2. `GET/POST /api/v1/projects/:id/attachments` — con el `{ url, name, mimeType }` del paso anterior. Requiere PM/admin.
3. `DELETE /api/v1/projects/:id/attachments/:attachmentId` — Requiere PM/admin.

### Tareas

- `GET /api/v1/projects/:id/tasks` — lista las tareas de un proyecto.
- `POST /api/v1/projects/:id/tasks` — crea una tarea. Requiere PM/admin. Acepta `requirementIds` opcional: los requerimientos del mismo proyecto a los que responde la tarea (uno o varios). **Etiquetas: después de crearla, `POST /tasks/:id/tags` con las mismas categorías que usan sus tareas hermanas (ver «Etiquetas», regla dura).**
  ```json
  {
    "phaseId": "string",
    "title": "string",
    "type": "SIMPLE | MILESTONE | QA | ADJUSTMENT | ACCEPTANCE",
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
- `GET /api/v1/tasks/:id` — detalle de una tarea: asignados, revisores, etiquetas, checklist ordenado (con su pregunta si tiene), insumos/resultados (`attachments`, con `kind`, `stepId` y quién subió), predecesoras (`dependsOn`) y sucesoras (`blocks`); incluye `delayDays` si está completada.
- `PATCH /api/v1/tasks/:id` — estado, título, descripción, fase (`phaseId` del mismo proyecto), link de reunión, riesgo. Requiere ser asignado/PM/admin. `requirementIds` (lista completa; `[]` para dejarla sin requerimiento) reemplaza los requerimientos a los que responde: solo PM/admin.
  Solo PM/admin: `type` (SIMPLE|MILESTONE|QA|ADJUSTMENT|ACCEPTANCE), `isUrgent: true|false` (marcarla urgente avisa por WhatsApp al instante), `archived: true|false` (archivar solo aplica a tareas completadas).
- `POST /api/v1/tasks/:id/duplicate` — duplica la tarea (datos, asignados, revisores, checklist sin marcar, etiquetas, insumos). PM/admin. Devuelve `{ id }`.
  ```json
  { "status": "NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETED | RETURNED" }
  ```
  El cambio de estado corre las MISMAS reglas que la app web: checklist de pasos completo, resultado cargado (Entregable), cambios respondidos (Ajuste), ronda de revisión aprobada (Prueba), "Devuelta" no se puede tocar a mano, y solo PM/admin puede reabrir una tarea ya completada o devolverla a "Sin iniciar". Cualquier violación → **409** con el motivo.
- `DELETE /api/v1/tasks/:id` — borra la tarea. Requiere PM/admin.

#### Cronograma (fechas y dependencias)

- `POST /api/v1/tasks/:id/move` — mueve el cuerpo completo de la barra: `{ "newStartDate": "2026-09-10", "expectedUpdatedAt": "...?" }`. Solo tareas que no iniciaron. Requiere PM/admin.
- `POST /api/v1/tasks/:id/resize` — mueve un extremo: `{ "edge": "start" | "end", "newDate": "..." }`. Requiere PM/admin.
- `GET/POST /api/v1/tasks/:id/dependencies` — `{ "predecessorId": "taskId", "type": "FINISH_TO_START | START_TO_START" }`. Requiere PM/admin.
- `DELETE /api/v1/tasks/:id/dependencies/:dependencyId` — Requiere PM/admin.

`expectedUpdatedAt` (el `updatedAt` de la tarea al leerla) es opcional pero recomendado — si alguien más la cambió mientras tanto, la llamada rechaza en vez de pisar ese cambio.

#### REGLA DURA: etiquetas en toda tarea de PMSK (usuario 2026-11-02)

Toda tarea que se cree en PMSK lleva las etiquetas que usa su proyecto (p. ej. `Sprint | Sprint N`, `Componente | <nombre>`), y toda tarea que se toque se revisa: si le falta alguna, se agrega. Antes de crear, mirar las tareas hermanas (`GET /projects/:id`) y las categorías (`GET /tags`). Aplica a desarrollo, Prueba, Ajuste, Aceptación, Entregable, subproyectos, duplicadas y combinadas. Al cerrar, comprobar que cada tarea creada o tocada las tenga. Detalle en «Etiquetas».

## REGLA DURA: insumo de diseño de una tarea de componente = solo su recorte (usuario 2026-11-11)

Al crear una tarea de componente o de ajuste a partir de capturas de páginas completas (inventario de páginas, diseño de una sección), a Insumos va **solo el recorte del segmento que se construye**, nunca la página completa. Se recorta a todo el ancho y solo el alto de esa sección (p. ej. con PIL), se revisan los recortes juntos antes de subirlos y se nombran «<componente> - <página>». Si el componente aparece en varias páginas, va un recorte por página. Motivo: en el inventario de Racafé (Mundo Racafé y Legales) se subió la página entera a 19 tareas y hubo que rehacerlas.

#### Asignados, revisores, checklist, etiquetas

- `PATCH /api/v1/tasks/:id/assignees` — `{ "assigneeIds": ["userId"] }`. Reemplaza la lista completa.
- `PATCH /api/v1/tasks/:id/reviewers` — `{ "reviewerIds": ["userId"] }`. Solo tiene efecto real en tareas tipo Prueba/QA.
- `GET/POST /api/v1/tasks/:id/steps` — `{ "description": "string" }`.
- `PATCH /api/v1/tasks/:id/steps/:stepId` — `{ "done"?: true, "description"?: "string" }` (al menos uno: marca el paso y/o cambia su texto). `DELETE` quita el paso.
- `POST /api/v1/tasks/:id/steps/reorder` — `{ "stepIds": [...] }` con todos los pasos en el orden nuevo.
- `POST /api/v1/tasks/:id/steps/:stepId/poll` — `{ "multiple": false, "options": ["A","B"] }` convierte el paso en pregunta (el enunciado es el texto del paso). El `GET` de pasos trae `poll.id`; se vota/cierra con `/api/v1/polls/:id` y se quita con `DELETE /api/v1/polls/:id`.
- `GET /api/v1/tags` — lista las categorías de etiqueta disponibles (id, name, colorHex, emoji).
- `POST /api/v1/tags/categories` — `{ "name", "colorHex", "emoji"? }` crea una categoría (PM de algún proyecto o admin). `colorHex` tiene que ser de la paleta de la app (si no, el 400 lista los válidos). `PATCH /api/v1/tags/categories/:id` (mismo cuerpo) la edita; `DELETE` la borra con sus etiquetas (solo admin).
- `GET/POST /api/v1/tasks/:id/tags` — `{ "categoryId": "string", "name"?: "string" }`. Una etiqueta por categoría en cada tarea (reemplaza si ya había una de esa categoría); si el nombre no existe todavía en el proyecto bajo esa categoría, se crea solo. `name` es opcional (desde 2026-10-07): sin nombre, la tarea queda marcada solo con la categoría. En la app se ve «Categoría | etiqueta», o solo la categoría.
- `DELETE /api/v1/tasks/:id/tags/:taskTagId` — quita la etiqueta.
- Etiquetas sueltas del proyecto (igual que Configuración → Etiquetas y el `manage_tag` del chat): `POST /api/v1/tags` `{ "categoryId", "projectId", "name" }` crea una sin ponerla en ninguna tarea (devuelve `tag: { id, name }`; nombre repetido en la misma categoría y proyecto → 409); `PATCH /api/v1/tags/:id` `{ "name" }` la renombra en todas sus tareas; `DELETE /api/v1/tags/:id` la quita de sus tareas, que se conservan. Crear y renombrar: PM del proyecto o admin; eliminar: solo admin.
- **Etiquetas (REGLA DURA, usuario 2026-11-02)**: antes de crear o tocar una tarea, mirar las etiquetas que usan las tareas del proyecto (`GET /projects/:id`, `GET /tags`). Si el proyecto las usa, **toda** tarea que se cree (desarrollo, Prueba, Ajuste, Aceptación, subtareas) lleva las mismas categorías que sus hermanas, p. ej. `Sprint | Sprint N` y `Componente | <nombre>`, con `POST /tasks/:id/tags`; y toda tarea posterior que afecte a un componente lleva su etiqueta de componente. Nunca crear tareas sin etiquetas en un proyecto que las usa. Al cerrar, revisar que cada tarea creada las tenga.
- **Contraseñas (credenciales, desde 2026-10-07)** — en la app se llaman «Contraseñas»; en la API, `credentials`. Cada una tiene `name`, `url?`, `username?`, `password`, `notes?` y `visibility`: `PROJECT` (por defecto: PM, asignados y revisores de alguna tarea del proyecto, y administradores), `ALL` (todos los que ven el proyecto) o `USERS` (solo `userIds`). Quien la creó la ve siempre, y los asignados de una tarea donde está agregada también. La contraseña se guarda cifrada (clave derivada de `AUTH_SECRET`). Quien no tiene acceso recibe 404, como si no existiera.
  - `GET /api/v1/projects/:id/credentials` lista las que la persona puede ver **con la contraseña** (decisión del usuario: la API sí la entrega a quien tiene acceso, para poder usarla). `GET /projects/:id` y `GET /tasks/:id` también traen `credentials`.
  - `POST /api/v1/projects/:id/credentials` `{ name, password, url?, username?, notes?, visibility?, userIds?, taskId? }`. Sin `taskId`, cualquier miembro del proyecto (responsable o revisor de al menos una tarea), el PM o un administrador; con `taskId`, quien puede editar esa tarea. Avisa por la app y por WhatsApp (individual, en horario laboral) a todos los que pueden verla, **sin la contraseña**.
  - `GET|PATCH|DELETE /api/v1/credentials/:id`. Editar o borrar: quien la creó, el PM o un administrador. En `PATCH`, `password` vacío conserva la actual; solo reciben aviso las personas que ganan acceso.
  - `POST /api/v1/tasks/:id/credentials` `{ credentialId }` la agrega como insumo de la tarea (sus asignados ganan acceso y reciben aviso); `DELETE /api/v1/tasks/:id/credentials?credentialId=…` la quita de la tarea (sigue en el proyecto).
  - El bot nunca escribe URL, usuario ni contraseña: solo el nombre y el enlace `/credentials/:id`. Nunca aparecen en el link compartido con el cliente.
  - También en **pasos del checklist y ajustes** (desde 2026-10-07): en la app, con «Contraseña» en el menú del clip del paso y con «+ Contraseña» o la Galería en los insumos de un ajuste. Siempre queda también en los insumos de la tarea (sus asignados la ven). Por API, `POST /api/v1/tasks/:id/credentials` cubre la tarea; para un paso o un ajuste se usa la app.
  - **Historial de acceso**: cada vez que alguien la abre, la muestra o copia la URL, el usuario o la contraseña, queda registrado con fecha y hora, y cada lectura por la API queda como «abrió» con `source: "api"`. `GET /api/v1/credentials/:id/access-log` lo devuelve (solo quien la creó, el PM o un administrador).

- `DELETE /api/v1/deliverables/:id` — quita un entregable de una ronda abierta (Prueba o Aceptación). `DELETE /api/v1/evidence/:id` — quita una evidencia de una prueba/característica. Los ids salen de `GET /api/v1/tasks/:id/design`.

### Revisión / QA (solo tareas `type: "QA"`)

Flujo: se envía una ronda (entregables opcionales: el link o archivo no es obligatorio, el revisor puede ya saber dónde está lo que revisa) → el revisor califica cada prueba → cierra la ronda (aprobada, o devuelta si algo quedó "Con errores") → si aprobó, se completa.

- `POST /api/v1/tasks/:id/review/rounds` — envía o reenvía una ronda:
  ```json
  { "deliverables": [{ "id": "string?", "name": "string", "url": "string", "mimeType": "string" }] }
  ```
  Al reenviar (ronda 2+, tras una devolución), pasá el `id` de un entregable de la ronda anterior para actualizarlo en el mismo lugar en vez de duplicarlo; omitilo para un entregable nuevo. `deliverables` puede ir vacío u omitirse. Exige que todas las pruebas "Con errores" de la ronda anterior ya tengan respuesta + evidencia de corrección.
- `PATCH /api/v1/tasks/:id/review/checks/:checkId/result` — califica una prueba: `{ "result": "APPROVED | FLAGGED | FAILED | NOT_APPLICABLE", "note": "string?" }`. Calificar `FAILED`/`FLAGGED` exige que la prueba ya tenga evidencia cargada (409 si no). `FLAGGED` se muestra como «Recomendación»: aprueba la prueba y no devuelve la ronda. Recalificar una prueba de la última ronda ya cerrada (tarea no completada) recalcula la ronda: sin `FAILED` queda Aprobada y la tarea sale de Devuelta; con `FAILED` queda Devuelta. En rondas anteriores o tareas completadas, 409.
- `POST /api/v1/tasks/:id/review/checks/:checkId/revert` — revierte una calificación a blanco. Solo mientras la ronda siga abierta.
- `POST /api/v1/tasks/:id/review/rounds/:roundId/close` — cierra la ronda (exige que todas las pruebas tengan resultado). Si alguna quedó "Con errores", la tarea pasa a "Devuelta".
- `POST /api/v1/tasks/:id/review/complete` — completa la tarea de Prueba (exige última ronda aprobada).

## Proyectos ocultos (regla dura, 2026-09-21)

Un proyecto oculto solo lo ve (por la app, la API, el chat y los avisos) el **administrador que además es su responsable (PM)**. Un segundo administrador, o un PM que no sea administrador, recibe 404 y no aparece en listas, búsquedas, resúmenes ni respaldos. Nunca envía avisos a grupos de WhatsApp. Ocultar o mostrar solo lo hace ese mismo administrador-PM.

## Registro del servidor (logs) — para diagnosticar problemas

La app escribe un registro en archivos `app-AAAA-MM-DD.log` (un JSON por línea: `t`, `level`, `scope`, `msg`, `data`), con todo lo que sale por consola (`[whatsapp]`, `[scheduler]`, `[resumen-diario]`, `[arranque]`…), los errores de peticiones (`scope: peticion`, con la ruta) y los errores fatales. Se guardan 14 días. Nunca llevan contraseñas, claves ni el texto de los mensajes de WhatsApp.

- **Por la API (solo administrador, con su login)**: `GET /api/v1/logs?list=1` lista los archivos; `GET /api/v1/logs?date=2026-09-21&level=warn&scope=whatsapp&q=texto&lines=300` lee entradas (las más recientes al final).
- **Por SSH (VPS, desde 2026-10-25)**: `ssh apps@2.24.88.123` (llave `~/.ssh/apps_vps`); la carpeta es `/opt/depura/apps/pmsk/data/logs/` (`LOG_DIR=/data/logs` dentro del contenedor, sobrevive a los despliegues): `tail -n 200 /opt/depura/apps/pmsk/data/logs/app-$(date +%F).log`, y `grep -i whatsapp` para filtrar. También `sudo docker logs pmsk-app --tail 200`.
- **En local**: carpeta `logs/` del proyecto.
- Al diagnosticar un fallo, leer primero los `warn`/`error` del día y las líneas `[arranque]` (muestran cuándo se reinició el servidor).

## Regla de atrasos (importante para no malinterpretar `delays`)

Una tarea solo aparece en `delays` si **su propia duración real** superó la planeada — no por haber arrancado tarde porque una tarea de la que dependía se demoró. Si el usuario pregunta "¿quién generó el atraso?", la respuesta está en este campo, no en comparar fechas de fin a simple vista.

## Lenguaje, tono y negritas de lo que se sube a la app → skill `pmsk`

Las reglas de lenguaje según quien lee, tono (tercera persona, de usted, cordial) y negritas para dar jerarquía están en la skill `pmsk` («Lenguaje según quien lee», «Tono de todo texto…», «Negritas…»). Valen igual acá; no se repiten para que no se contradigan.

## Diseñar Ajustes, Pruebas y Aceptaciones (y subirlos al sistema)

La idea: la persona diseña en la conversación (los cambios pedidos, las pruebas, las características a aceptar) y Claude lo sube. **Confirmá la lista completa con la persona antes de subirla.**

**Archivos e imágenes.** Todo campo «archivo» es `{ "url", "name", "mimeType"? }`: la `url` es la que devuelve `POST /api/upload` (multipart, campo `file`, mismo `Authorization: Bearer`; imágenes PNG/JPG/WEBP/GIF, PDF, Word, Excel, PowerPoint, TXT/CSV/MD, hasta 50 MB; también comprimidos ZIP, RAR, 7Z, TAR, GZ, TGZ, BZ2 y XZ (desde 2026-10-07); sin SVG ni video; HTML solo si quien inició sesión es administrador o PM de algún proyecto, y se ve aislado en un visor con sandbox) o un link `https://…`. Cualquier otra ruta se rechaza (400). Solo se puede subir un archivo que Claude pueda leer desde donde corre (Claude Code en la computadora de la persona: `curl -F "file=@/ruta/imagen.png"`); si no, usar un link.

**HTML con recursos locales (regla del usuario, 2026-10-07).** Antes de subir cualquier `.html`, incrustar sus imágenes, CSS y JS locales con `npx tsx scripts/incrustar-html.mts <entrada.html> [salida.html]`: al subirlo solo viaja el `.html` (renombrado por su contenido), y toda ruta relativa (`img/…`, `css/…`, `js/…`) queda rota en la app y en el link compartido. Subir el resultado, avisar lo «No encontrado» y verificar el link público (HTTP 200, sin rutas relativas). El JS sí corre en el visor (sandbox `allow-scripts allow-same-origin`, ver `src/lib/htmlShell.ts`).

- `GET /api/v1/tasks/:id/design` — estructura completa de una tarea Ajuste/Prueba/Aceptación (devuelve `items` y/o `rounds` siempre que existan, aunque a la tarea le hayan cambiado el tipo): cambios (con `before`/`after`, `insumos` internos —el cliente no los ve— y calificación del cliente) o rondas (quién la envió, entregables) con sus pruebas/características, resultados, `responseCategory`, evidencias y quién calificó. Trae los ids que piden los demás endpoints. Cualquier usuario con sesión.
- `POST /api/v1/tasks/:id/design` — **el diseño completo en un llamado**, según el tipo de la tarea:
  - **Ajuste**: `{ "items": [{ "description": "…", "note": "?", "before": [archivo], "after": [archivo] }] }` (agrega al final).
  - **Prueba y Aceptación**: `{ "deliverables": [archivo], "templateId": "?", "checks": [{ "title": "…", "criteria": "un punto por línea", "category": "?", "evidence": [archivo] }] }`. Si la tarea no tiene ronda, la crea (con lo entregado, si hay: `deliverables` es opcional); si la ronda 1 sigue abierta, solo agrega. `templateId` solo en Prueba. Devuelve `roundId` y los ids de los checks.
- Ajustes, en detalle: `PATCH|DELETE /api/v1/adjustment-items/:itemId` (descripción/nota), `POST /api/v1/adjustment-items/:itemId/attachments` (`{ "kind": "BEFORE|AFTER", "files": […] }`), `POST /api/v1/adjustment-items/:itemId/reopen-review` (deja que el cliente califique de nuevo ese cambio), `DELETE /api/v1/adjustment-attachments/:id` (solo PM/admin).
- Pruebas y Aceptación, en detalle: `POST /api/v1/rounds/:roundId/checks` (`{ "checks": […] }`, solo la primera ronda abierta), `PATCH /api/v1/checks/:checkId` (`{ title?, criteria?, category? }`, reescribe el texto sin perder capturas ni comentarios; sin resultado y ronda abierta), `DELETE /api/v1/checks/:checkId` (sin resultado), `POST /api/v1/checks/:checkId/evidence` (`{ "files": […] }`), `PUT /api/v1/checks/:checkId/response` (`{ "response" }`: respuesta a una prueba «Con errores»; asignado/PM/admin; una nueva se guarda sola en su categoría; reutilizar antes las de `suggestedResponses` en `/design` o `GET /api/v1/response-categories`, y si hace falta una nueva, general: el tipo de error, no el caso; la evidencia de la corrección es obligatoria y se sube antes de reenviar, para que quede como «Respuesta» en la misma tarjeta), `POST /api/v1/rounds/:roundId/deliverables`, `POST /api/v1/rounds/:roundId/apply-template` (`{ "templateId" }`, solo Prueba), `PUT /api/v1/tasks/:id/review/default-template` (`{ "templateId": "…" | null }`, solo Prueba, revisor/PM/admin): plantilla que se copia sola a la ronda 1 cuando el ejecutor entrega; antes de que exista la ronda.
- Perfil de la empresa: `GET /api/v1/company-profile` (nombre, temas, tipos de tarea de la empresa; admin además clientes, crecimiento, «Qué quiere revisar con la aplicación», «Consejos que espera», documentos y avance; los demás solo lo institucional) y `PATCH /api/v1/company-profile` (`{ "topic", "text" }`, solo admin; topic = `name` o `sector|business|history|purpose|workflow|clients|portfolio|growth|app_goals|advice`). Leerlo antes de dar conclusiones o consejos de empresa: las intenciones («Qué quiere revisar…», «Consejos que espera») dicen qué tipo de conclusiones necesita.
- Plantillas de pruebas (revisor, PM o administrador en todo, igual que en la web; borrar solo administrador — ver «Permisos»): `GET|POST /api/v1/test-templates` (lista con ítems / crea `{ "name": "…", "items": [{ "title": "…", "criteria": "un punto por línea", "category": "?" }] }`, devuelve `id` e `itemIds`), `PATCH|DELETE /api/v1/test-templates/:id` (`{ "name" }` / borra con sus ítems), `POST /api/v1/test-templates/:id/items` (agrega al final), `PATCH|DELETE /api/v1/test-template-items/:itemId` (`{ title, criteria?, category? }` reescribe el ítem completo: lo que no se mande queda vacío). Cambiar una plantilla no toca las rondas donde ya se aplicó.
- **Plantillas por tipo de componente, nunca por tarea** (regla del usuario 2026-11-11): una plantilla de pruebas se arma para un tipo de componente («Carrusel / slider», «Formulario», «Encabezado y menú», «Listado con filtros», «Popup / modal»…) y se reutiliza en otras tareas y proyectos. Antes de crear: `GET /api/v1/test-templates` y elegir la del mismo tipo → si encaja, se reutiliza; si encaja casi, se mejora esa misma solo con lo que sirve a cualquier componente de ese tipo (sin quitar ítems que otras tareas usan); solo si no hay ninguna del tipo se crea una, con nombre del tipo (nunca proyecto, cliente, sección ni título de tarea). Lo propio de la tarea (sus RF, textos, contenidos) va directo a la ronda (`POST /tasks/:id/design {templateId, checks}`, que crea la ronda si no existe y la envía a revisión), nunca a la plantilla. Al reportar, decir qué plantilla se reutilizó, mejoró o creó. Motivo: Configuración → Pruebas se llenaba de plantillas de un solo uso. Detalle en la skill `sdd` («Tarea de tipo Prueba», caso B, paso 4).
- Aceptación: `POST /api/v1/tasks/:id/acceptance/rounds` (envía o reenvía la entrega al cliente: `{ "deliverables": […] }`), `POST /api/v1/tasks/:id/acceptance/complete` (cuando el cliente aceptó la última ronda). **El cliente califica desde su link**: la API nunca acepta ni devuelve por él.
- Adjuntos de la tarea: `GET|POST /api/v1/tasks/:id/attachments` (`{ "kind": "INSUMO|RESULTADO", "files": […] }`). `PUT /api/v1/tasks/:id/attachments/:attachmentId` (`{ url, name, mimeType? }` de `/api/upload`) reemplaza el archivo en su mismo lugar; `DELETE` lo quita. Solo quien subió ese archivo, y no en una tarea completada (409).
- **Sin duplicados (desde 2026-10-06)**: `/api/upload` nombra cada archivo por la huella de su contenido (el mismo archivo subido otra vez, con cualquier nombre, devuelve la misma `url`). Si un archivo o link ya está en esa misma sección (Insumos de la tarea, Antes de un cambio, entregables de una ronda, Definición…), no se agrega otra vez: las cargas múltiples (`/attachments`, `/design`, `/rounds/:id/deliverables`, `/checks/:id/evidence`, archivos de un cambio) devuelven `added` y `skipped: [nombres]`, y `POST /projects/:id/links` devuelve el link existente con `skipped: true`. En secciones distintas sí se permite. Dos links son el mismo si coinciden ignorando el nombre, `http`/`https`, `www.`, mayúsculas del dominio, la barra final y el `#ancla`; YouTube se compara por el id del video (`linkKey` en `src/lib/attachments.ts`).
- Link para el cliente: `GET|POST|DELETE /api/v1/tasks/:id/share-link` y `/api/v1/projects/:id/share-link`. Devuelven `path` (`/share/<token>`); anteponer la URL del servidor. El cliente, sin cuenta, comenta (con imágenes), responde preguntas, califica ajustes con «Enviar mi revisión» y acepta o devuelve características.

## Comentarios, menciones, imágenes y preguntas

- `POST /api/v1/tasks/:id/comments` — `{ "scope", "targetId"?, "body", "parentId"?, "mentions"?: [userId], "attachments"?: [archivo], "poll"?: { "multiple": false, "options": ["A","B"] } }`.
  `scope`: `task` (comentario general, lo ve el cliente; los archivos quedan como Insumos) · `adjustment_item` (targetId = id del cambio) · `acceptance_check` (targetId = id de la característica) · `qa_check` (hilo interno de una prueba; targetId = id de la prueba; admite menciones) · `round` (hilo interno de la ronda; targetId = id de la ronda) · `conversation` (conversación interna de la tarea; menciones e imágenes).
- `POST /api/v1/projects/:id/comments` — mismo cuerpo, `scope`: `project_conversation` (conversación interna del proyecto) · `project_definition` (hilo de la Definición que ve el cliente; sin adjuntos).
- **Pregunta**: con `poll`, el comentario pasa a ser una pregunta de selección única (`multiple: false`, radio) o múltiple (`true`, casillas) de 2 a 10 opciones, y `body` es el enunciado. Solo el equipo las publica; el cliente las responde desde su link.
- `PATCH /api/v1/messages/:id` — `{ "body" }` edita un mensaje propio de la conversación interna (`conversation`, `qa_check`, `project_conversation`) dentro de la ventana de edición; `DELETE` lo borra (el autor en esa ventana, o PM/admin siempre). El id sale de `GET …/threads` (campo `text`).
- `GET /api/v1/projects/:id/threads` — hilos del proyecto: `definition` (comentarios de la Definición, los ve el cliente) y `conversation` (interna; `body` con las marcas de imágenes/archivos).
- `GET /api/v1/tasks/:id/threads` — todos los hilos de la tarea agrupados por lugar (`general`, `adjustmentItems`, `acceptanceChecks`, `qaChecks`, `rounds`, `conversation`), con las preguntas y su estadística. En `conversation` y `qaChecks`, `text` es texto plano sin URLs; las imágenes/archivos/links están en `body` como marcas `[[img:url]]`, `[[file:url|nombre]]`, `[[link:url|título]]`.
- `GET /api/v1/polls/:id` — la pregunta con cuántas personas eligieron cada opción y quién. `POST /api/v1/polls/:id/vote` (`{ "optionIds": […] }`, con la persona que inició sesión). `PATCH /api/v1/polls/:id` (`{ "closed": true|false }`).
- Los porcentajes son sobre las **personas que respondieron**: en selección múltiple pueden sumar más de 100 %.
- **🤖 al inicio de todo lo que escribe la IA** (regla del usuario, 2026-11-02): todo comentario, respuesta o pregunta que se publique por la API (`body` de `POST /tasks/:id/comments` y `/projects/:id/comments`, en cualquier `scope`, también los que ve el cliente) empieza con `🤖 ` para que se sepa que se escribió con ayuda de la IA. Ej.: `🤖 *Qué se hizo:* …`.
- **Aviso**: publicar en la conversación interna o en el hilo de una prueba con `mentions` avisa por WhatsApp a las personas mencionadas y a quienes participan de la tarea (igual que en la app). No publicar comentarios de prueba.

## No cubierto todavía por la API

Estas acciones solo se pueden hacer desde la app web por ahora — decíselo a la persona si las pide:
- Editar o borrar comentarios de los hilos que ve el cliente (`task`, `adjustment_item`, `acceptance_check`) y de las rondas.
- Gestionar usuarios (crear, rol, contraseña, desactivar): decisión 2026-10-03, queda solo en la app.
- Sincronizar con Google Calendar (usa el login personal de Google en el navegador).
- Calificar una característica de Aceptación: la hace el cliente desde su link.
- Aplicar o quitar plantillas de Configuración, y categorías de respuesta de Pruebas (Configuración). Las plantillas de pruebas sí se gestionan por API (ver arriba).

## Ejemplo (curl) — URL + login + una llamada

```bash
BASE_URL=${PMSK_BASE_URL:-https://pmsk.depura-creatividad.com}
set -a; . ./.pmsk.env; set +a   # usuario y contraseña (cómo se arma: skill pmsk, «Credenciales»)

TOKEN=$(curl -s "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\": \"$PMSK_USER\", \"password\": \"$PMSK_PASSWORD\"}" | jq -r .token)

curl -s "$BASE_URL/api/v1/projects" -H "Authorization: Bearer $TOKEN"
```
