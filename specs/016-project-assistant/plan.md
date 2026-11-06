# Plan 016 — Asistente de proyectos y clientes

Spec: [spec.md](spec.md) (aprobada 2026-11-05). Diagrama: [change-diagram.png](change-diagram.png).

## Inventario de impacto

### Cliente del proyecto (`Project.clientName` → `Client` + `Project.clientId`)
Decisión: `clientName` se conserva como el nombre visible y se sincroniza desde el cliente; así ningún lector cambia.

| Consumidor | Estado |
|---|---|
| `projects/CreateProjectForm.tsx` + `projects/actions.ts createProject` | ✅ se ajusta: buscador `SearchableSelect allowCustom` (RF-6) |
| `projects/[id]/ProjectIdentityForm.tsx` + `definitionActions.ts` | ✅ se ajusta: mismo buscador (RF-6) |
| `projects/[id]/page.tsx` (encabezado «Cliente · Inicio») | ✅ se ajusta: link a la ficha para PM/admin (RF-7) + botón «Completar con asistente» (RF-10) |
| `projects/[id]/DefinitionTab.tsx` | ✅ se ajusta: pasa `clientId` al formulario |
| `projects/ProjectSummaryGrid.tsx` | ✅ se ajusta: botón «Crear con asistente» (RF-10) |
| `api/v1/projects` (POST) y `api/v1/projects/[id]` (PATCH) | ✅ se ajusta: aceptan `clientId` o `clientName` (busca o crea) (RF-8) |
| `chontatecTools` `create_project` / `update_project` | ✅ se ajusta: igual que la API (RF-8) |
| `api/export` / `api/import` | ✅ se ajusta: exporta el nombre (igual que hoy); al importar se une o crea el cliente (RF-5) |
| `api/search` (buscador) | ➖ no aplica: busca por `clientName`, que se mantiene |
| `share/[token]` + `publicView.ts` (link del cliente) | ➖ no aplica: solo el nombre, como pide RF-9 |
| Avisos, WhatsApp, resumen diario, colas, tareas programadas | ➖ no aplica: no usan el cliente (grep sin resultados en notifications/whatsapp) |
| Reportes / Rendimiento | ➖ no aplica: no agrupan por cliente (entrega 3) |
| Copias de seguridad totales | ➖ no aplica: respaldan la base completa; la tabla nueva entra sola |
| Scripts de carga (`scripts/*`) | ➖ no aplica: crean proyectos con nombre; el enlace al arrancar los une |

### Asistentes y chat
| Consumidor | Estado |
|---|---|
| `chontatec.ts` motor (`ConversationMode`, loop) | ✅ se ajusta: herramientas de tipo servidor (búsqueda), `pause_turn`, tope de 5 búsquedas (RF-40) |
| `chatMode` (chat web y WhatsApp) | ✅ se ajusta: ofrece el link del asistente de proyectos a admin y PM (RF-29, RF-30) |
| `companyAssistant.ts` (asistente de empresa) | ✅ se ajusta: leer web + búsqueda (RF-45) |
| `CompanyAssistant.tsx` | ✅ se ajusta: pasa a usar la pantalla compartida (sin cambio visible) |
| Chat flotante | ➖ no aplica: solo cambia el texto que arma el servidor |
| `actorContext.ts` `ChatChannel` | ✅ se ajusta: canales `project:new`, `project:<id>`, `client:new` |
| Historial de otro canal (`loadOtherChannelExcerpt`) | ➖ no aplica: solo lee web/WhatsApp |
| `featureHints.ts` | ✅ se ajusta: 2 avisos (RF-35) |

## Datos
```prisma
model Client {
  id           String   @id @default(cuid())
  name         String
  nameKey      String   @unique   // normalizeSearchText + espacios colapsados (RF-4)
  logoUrl      String?
  contactName  String?
  contactEmail String?
  contactPhone String?
  website      String?
  profile      String?  @db.Text
  createdById  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  projects     Project[]
}
Project.clientId String? → Client (onDelete: SetNull)
```
- Migración `20261107120000_clients` (solo esquema).
- Unión de los existentes (RF-5): `linkLegacyClients()` en `src/lib/clients.ts`, idempotente, en `instrumentation.ts` (como la compresión de archivados) y al terminar un import.

## Archivos

**Nuevos**
- `src/lib/clients.ts`: `clientKey`, `findOrCreateClient(name, userId)`, `setProjectClient`, `saveClient`, `deleteClient` (los proyectos conservan el nombre), `linkLegacyClients`, `clientVisibleWhere(user)` (admin: todos; PM: los de sus proyectos). Regla única para app, API y bot (RF-1 a RF-8).
- `src/lib/webPage.ts`: `readWebPage(url)` lee una página pública: solo http/https, resuelve el DNS y rechaza IPs privadas o locales, máximo 2 MB y 10 s, convierte el HTML a texto (máx. 20.000 caracteres). Devuelve un error en lenguaje simple si no se puede (RF-39, RF-43).
- `src/lib/webSearch.ts`: `webSearchTool(conn, used)` devuelve la herramienta de búsqueda del servicio si es `anthropic` o `deepseek` y quedan búsquedas (5 − usadas en el canal); con otro servicio, `null` (RF-40, RF-44).
- `src/lib/projectAssistant.ts`: `projectAssistantMode(projectId | null)` y `clientAssistantMode()`. Reglas por paso, `snapshot` (perfil de empresa, cliente, estado del proyecto, proyectos parecidos), herramientas: lectura del bot que hacen falta + `focus_assistant_step`, `skip_assistant_step`, `read_web_page`, `find_similar_projects`, `save_client` (escritura con Confirmar) y las de escritura del bot para crear (`create_project`, `update_project`, `set_project_role`, `manage_objective`, `manage_requirement`, `manage_phase`, `create_task`, `set_task_dependency`, `set_task_tag`, `add_project_files`), con los mismos permisos.
- `src/lib/projectAssistantSteps.ts` (sin "use client"): `PROJECT_STEPS`, `CLIENT_STEPS`, `projectStepStates(project, history)`. Cubierto sale de los datos del proyecto; en curso y saltado salen de las llamadas `focus`/`skip` guardadas en la conversación (no hace falta tabla) (RF-12, RF-17, RF-25).
- `src/lib/similarProjects.ts`: `similarProjects(userId, { clientId, text })`: hasta 3 proyectos visibles (activos o archivados) del mismo cliente o con palabras en común en nombre/descripción, con fases, duración real en días hábiles y cantidad de rondas de Prueba (RF-21).
- `src/components/chat/GuidedAssistant.tsx`: la pantalla del asistente de empresa sacada a un componente (pasos, barra de avance, barra en celular, voz, archivos, Confirmar, «Empezar de nuevo»). Recibe pasos y acciones por props (RF-12, RF-13, RF-36).
- `src/app/(app)/projects/assistant/page.tsx` + `ProjectAssistant.tsx` + `actions.ts`: ruta `/projects/assistant?project=<id>`. Permiso: admin o PM; con proyecto, PM de ese proyecto o admin (RF-10, RF-11). Al confirmar el bloque 1, la conversación pasa de `project:new` a `project:<id>` y la pantalla cambia la dirección (RF-15).
- `src/app/(app)/company/clients/…`: bloque «Clientes» (lista + buscador), ficha `/company/clients/[id]` (datos, Perfil, proyectos, Editar, Eliminar con `useConfirm`) y `/company/clients/assistant` (RF-1 a RF-3, RF-38).
- `src/app/(app)/clients/[id]/page.tsx`: ficha de solo lectura para el PM del proyecto (RF-7).
- `src/app/api/v1/clients/route.ts` + `[id]/route.ts` (RF-8).
- `scripts/verify-project-assistant.ts` + `npm run verify:project-assistant`.

**Cambian**
- `prisma/schema.prisma`, `src/lib/actorContext.ts`, `src/lib/chontatec.ts` (ver inventario), `src/lib/chontatecTools.ts`: `create_project` acepta `clientId`/cliente, `description` y `targetEndDate`; `manage_requirement` acepta `objectiveTitles`; `set_task_dependency` acepta `projectId` + `taskTitle`/`predecessorTitle`; herramientas `list_clients`, `get_client`, `save_client`. Con eso cada bloque va en una sola confirmación, porque las escrituras se ejecutan en orden y se apoyan en títulos y no en ids (RF-23).
- `companyAssistant.ts`, `CompanyAssistant.tsx`, `CompanyPageView.tsx` (+ bloque Clientes), formularios de proyecto, `ProjectSummaryGrid.tsx`, `projects/[id]/page.tsx`, API de proyectos, export/import, `instrumentation.ts`, `featureHints.ts`.

## Lógica principal
```
abrir asistente(projectId?):
  permiso → si no, «no tiene acceso»
  canal = projectId ? project:<id> : project:new
  pasos = projectStepStates(proyecto, historial)
  si perfil de empresa vacío: admin → mensaje con link + «Seguir sin el perfil»; PM → aviso una vez (RF-27, RF-28)

conversación (motor existente):
  tools = herramientas del modo + búsqueda si el servicio la tiene y quedan búsquedas
  la IA arma un bloque → propone TODAS sus escrituras juntas → un solo «Confirmar»
  al confirmar: se ejecutan en orden; cada falla queda en su resultado y la IA la explica (RF-33)
  create_project ok en canal project:new → mover historial a project:<id> → la pantalla navega

búsqueda: response.stop_reason == "pause_turn" → seguir el loop con el contenido tal cual
```

## Decisiones técnicas
- **Bloques con las herramientas que ya existen** + búsqueda por título, en vez de una herramienta nueva «crear bloque». Descartada porque duplicaría las reglas de crear tareas. Riesgo: un bloque grande arma un resumen largo; se acepta (caso límite de la spec).
- **Búsqueda del servicio de IA** (DeepSeek/Claude) en vez de un buscador externo (Brave, Tavily): no suma otra cuenta ni otra clave, y el usuario ya usa DeepSeek. Con Gemini u otros, solo se leen links (RF-44).
- **Lectura de páginas en nuestro servidor** con bloqueo de direcciones internas, para que nadie use el bot para leer servicios de la red del VPS.
- **`clientName` se mantiene** como nombre visible: evita tocar buscador, link compartido, exportación y resúmenes.
- **Estado de los pasos sin tabla nueva**: cubierto sale de los datos y en curso/saltado sale del historial del asistente.
- **Pantalla compartida** sacada del asistente de empresa (regla: reutilizar). Se reutiliza también `SearchableSelect`, `useConfirm`, el grabador y la subida de archivos.

## Avisos de novedad (RF-35) — textos para aprobar
- `project-assistant` (admin y PM, botón «Crear con asistente»): **«Crear proyectos con el asistente»** — «El asistente pregunta paso a paso por el proyecto, el cliente, el equipo y las tareas, y crea todo después de cada confirmación.»
- `company-clients` (admin, bloque «Clientes» de Empresa): **«Clientes de la empresa»** — «Cada cliente tiene su ficha con contacto y perfil, y se reutiliza en todos sus proyectos.»

## Verificación
- `npx tsc --noEmit`, `npm run lint`.
- `npm run verify:project-assistant`: `clientKey` (mayúsculas, tildes y espacios), `linkLegacyClients` en una base de prueba en transacción con rollback (RF-4, RF-5), `clientVisibleWhere` por rol (RF-8), permiso del asistente (RF-11, RF-30), `projectStepStates` con proyecto vacío y completo (RF-17), `webSearchTool` según el servicio (RF-44) y que `readWebPage` rechace `localhost` y 10.x/192.168.x (RF-39).
- `npm run verify:company-profile` (que no se rompa la entrega 1).
- Sin navegador no se puede probar: voz, arrastrar archivos, responsive, la búsqueda real con DeepSeek ni la conversación completa. Quedan como pendientes de prueba visual (pedir autorización).

## Cobertura de RF
RF-1–3, 38 → Empresa/clients · RF-4–5 → clients.ts + arranque · RF-6 → formularios · RF-7 → /clients/[id] · RF-8 → API + bot · RF-9 → sin cambio en publicView · RF-10–15 → projects/assistant + GuidedAssistant · RF-16–26 → projectAssistant.ts (reglas, snapshot, herramientas) + similarProjects · RF-27–28 → reglas + snapshot · RF-29–30 → chatMode · RF-31–34 → motor existente + permisos de las herramientas · RF-35 → featureHints · RF-36–37 → GuidedAssistant / Clientes · RF-39–45 → webPage, webSearch, motor, ambos asistentes.
