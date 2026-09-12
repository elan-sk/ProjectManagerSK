# Sistema de Revisión (ex "Prueba QA") — diseño pendiente de implementar

Este documento nace de la sesión `/solo` del 2026-09-10. El punto 2.6 del pedido original
(flujo de revisión/devolución con dos grupos, plantillas de pruebas, plantilla de respuestas,
y su integración con Rendimiento) es, en sí mismo, un sub-producto completo — un mini
sistema de QA. No se implementó en esa sesión por volumen: se prefirió dejar el resto del
Bloque 2 (tipos unificados, checklist transversal, reuniones, Entregable, Ajustes) terminado
y probado, en vez de dejar 10 tablas nuevas sin UI funcional.

Lo que **sí** quedó hecho de este punto: el tipo de tarea `QA` se renombró en la UI a
"Revisión" (`TASK_TYPE_LABEL.QA` en `src/lib/statusColors.ts`) — el nombre interno del enum
no cambió para no migrar datos.

Todo lo que sigue es diseño, no código.

## Decisiones ya confirmadas con el usuario

- Nombre del tipo: **"Revisión"**.
- El resultado "Con errores" dispara un estado de tarea nuevo: **"Devuelta"**, como quinto
  valor de `TaskStatus` (junto a Sin iniciar/En curso/Bloqueada/Completada), no un sub-estado.
- El chat de devolución permite **editar** mensajes, pero no borrarlos, y no tiene menciones @persona.
- "Administrador de QA" (quien puede borrar definitivamente un ítem de una plantilla) = el
  **ADMIN global** ya existente, sin rol nuevo.

## Modelo de datos propuesto

```prisma
enum TaskStatus {
  NOT_STARTED
  IN_PROGRESS
  BLOCKED
  COMPLETED
  RETURNED   // nuevo — "Devuelta"
}

// Segundo grupo de personas de una tarea tipo Revisión, distinto de
// TaskAssignee (que son quienes ejecutan). Solo tiene sentido en type=QA.
model TaskReviewer {
  taskId String
  task   Task   @relation("TaskReviewers", fields: [taskId], references: [id], onDelete: Cascade)
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([taskId, userId])
}

// Configuración > "Pruebas": plantillas reutilizables de checks.
model TestTemplate {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  items     TestTemplateItem[]
}
model TestTemplateItem {
  id          String       @id @default(cuid())
  templateId  String
  template    TestTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  description String
  category    String?
  order       Int
}

// Una ronda de revisión = un envío a revisar + sus checks + su resultado.
// roundNumber sube en cada reintento tras una devolución.
model ReviewRound {
  id            String         @id @default(cuid())
  taskId        String
  task          Task           @relation(fields: [taskId], references: [id], onDelete: Cascade)
  roundNumber   Int
  submittedById String
  submittedBy   User           @relation(fields: [submittedById], references: [id])
  submittedAt   DateTime       @default(now())
  outcome       ReviewOutcome? // null mientras está en curso
  closedAt      DateTime?

  deliverables  ReviewDeliverable[]
  checks        ReviewCheck[]
  messages      ReviewMessage[]
}

enum ReviewOutcome {
  APPROVED
  RETURNED
}

// Lo que el responsable entrega para que se revise (link o archivo).
model ReviewDeliverable {
  id            String      @id @default(cuid())
  reviewRoundId String
  reviewRound   ReviewRound @relation(fields: [reviewRoundId], references: [id], onDelete: Cascade)
  fileUrl       String
  fileName      String
  mimeType      String
  uploadedAt    DateTime    @default(now())
}

enum CheckResult {
  APPROVED  // Aprobada
  FLAGGED   // Con hallazgos
  FAILED    // Con errores
}

// Instancia editable de un ítem de plantilla (o agregado ad-hoc) dentro de
// UNA ronda — quitar/editar acá NUNCA toca TestTemplateItem.
model ReviewCheck {
  id                String       @id @default(cuid())
  reviewRoundId     String
  reviewRound       ReviewRound  @relation(fields: [reviewRoundId], references: [id], onDelete: Cascade)
  templateItemId    String?      // referencia informativa a la plantilla de origen, si vino de una
  description       String
  category          String?
  result            CheckResult?
  note              String?      // comentario del revisor
  responseCategory  String?      // categoría de respuesta elegida por el responsable al corregir
  order             Int
  evidence          ReviewCheckEvidence[]
}

model ReviewCheckEvidence {
  id            String      @id @default(cuid())
  reviewCheckId String
  reviewCheck   ReviewCheck @relation(fields: [reviewCheckId], references: [id], onDelete: Cascade)
  fileUrl       String
  fileName      String
  mimeType      String
  uploadedAt    DateTime    @default(now())
}

// Chat de devolución — editable, no borrable, sin menciones.
model ReviewMessage {
  id            String      @id @default(cuid())
  reviewRoundId String
  reviewRound   ReviewRound @relation(fields: [reviewRoundId], references: [id], onDelete: Cascade)
  authorId      String
  author        User        @relation(fields: [authorId], references: [id])
  body          String
  editedAt      DateTime?
  createdAt     DateTime    @default(now())
}

// Plantilla de respuestas para quien corrige — categorías + respuestas predefinidas.
model ResponseCategory {
  id        String @id @default(cuid())
  name      String
  responses ResponseTemplate[]
}
model ResponseTemplate {
  id         String           @id @default(cuid())
  categoryId String
  category   ResponseCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  text       String
}
```

## Flujo (máquina de estados)

1. Tarea `type=QA` tiene `assignees` (ejecutores) y `reviewers` (`TaskReviewer`).
2. El/los ejecutores trabajan; al terminar, crean un `ReviewRound` (roundNumber=1) con al
   menos un `ReviewDeliverable` (link o archivo). La tarea pasa a "En revisión" — no hace
   falta un status nuevo para esto, alcanza con la `ReviewRound` abierta (`outcome=null`)
   asociada a la tarea; el `TaskStatus` puede seguir en `IN_PROGRESS`.
3. Un `reviewer` abre la ronda, elige una `TestTemplate` (opcional) — sus `TestTemplateItem`
   se **copian** como `ReviewCheck` de esa ronda (editables/removibles sin tocar la plantilla).
   Puede agregar `ReviewCheck` ad-hoc.
4. Por cada `ReviewCheck`, el revisor pone `result` (APPROVED/FLAGGED/FAILED), `note`, y
   opcionalmente `evidence`.
5. Al cerrar la ronda:
   - Si ningún check quedó en `FAILED` → `outcome=APPROVED`, `closedAt`, la tarea puede
     pasar a `COMPLETED` (sujeto a las demás reglas ya existentes: checklist, etc.).
   - Si algún check quedó en `FAILED` → `outcome=RETURNED`, `closedAt`, `Task.status =
     RETURNED`. Se abre `ReviewMessage` (el hilo ya existe implícito en la ronda).
6. El responsable corrige, responde en el chat (opcionalmente eligiendo una
   `ResponseTemplate`/categoría por cada `FAILED`, guardado en `ReviewCheck.responseCategory`),
   y crea una **nueva** `ReviewRound` (roundNumber+1) con nuevas `ReviewDeliverable`.
7. Vuelve al paso 3. El ciclo continúa hasta `APPROVED`.

## Permisos (propuesta, a confirmar)

- Agregar/quitar `reviewers`: PM/admin (mismo criterio que asignar `assignees`).
- Crear una `ReviewRound` (enviar a revisar): un `assignee` de la tarea, PM o admin
  (`canEditTask`).
- Cargar `ReviewCheck`/resultado/evidencia, cerrar la ronda: un `reviewer` de la tarea, PM o
  admin — nueva función tipo `canReviewTask(taskId)` en `src/lib/permissions.ts`, análoga a
  `canEditTask` pero mirando `TaskReviewer` en vez de `TaskAssignee`.
- Mensajes del chat: cualquiera de los dos grupos + PM/admin. Editar un mensaje: solo su autor.
- Plantillas (`TestTemplate`/`TestTemplateItem`, `ResponseCategory`/`ResponseTemplate`):
  crear/editar — cualquiera con acceso a Configuración > Pruebas (a definir si es todo
  usuario o solo PM/admin); **borrar definitivamente un ítem de plantilla** — solo ADMIN
  global (ya decidido).

## UI a construir

- `src/app/(app)/settings/tests/` — nueva sección "Pruebas" en Configuración: CRUD de
  `TestTemplate`/`TestTemplateItem` y de `ResponseCategory`/`ResponseTemplate`.
- En el detalle de una tarea `type=QA`: selector de `reviewers` (además de `assignees`),
  panel de "Enviar a revisión" (deliverables), y el panel de la ronda activa con la lista de
  checks (buscador + autocompletado al elegir plantilla, selección rápida de resultado,
  carga de evidencia por check) — ver la sección "Facilidad de uso" del pedido original.
- Historial de rondas anteriores (colapsado), con su chat.
- Badge de estado "Devuelta" en Tablero/Gantt/Calendario (`TASK_STATUS_LABEL`/`TASK_STATUS_COLOR`
  en `src/lib/statusColors.ts`).

## Plantillas iniciales sugeridas (punto 2.6.4)

**Categorías de check** (`TestTemplateItem.category`): Convenciones de código,
Responsividad, Usabilidad, Cumplimiento de requerimientos, Valores límite, Validaciones,
Casos extremos, Consistencia, Errores de lógica, Comportamiento inesperado, Accesibilidad,
Rendimiento, Seguridad.

**Categorías de respuesta** (`ResponseCategory`): Error de lógica, Incumplimiento de
requerimiento, No aplicación de convenciones, Problema de usabilidad, Problema de
responsividad, Problema de validación, Problema de comportamiento, Caso límite no
contemplado, Problema de accesibilidad, Problema de rendimiento, Otro.

Con respuestas predefinidas típicas por categoría (ejemplos, a ajustar con el usuario):
"Corregido según especificación", "Ajustado el estilo/breakpoint", "Agregada validación
faltante", "Refactorizado el flujo", "No aplica — [explicar]", "Ya corregido en un cambio
anterior — verificar de nuevo".

## Integración con Rendimiento (punto 2.6.2)

En `src/app/(app)/performance/` (ya existe la página) agregar, por persona y por equipo:

- Rondas de revisión por persona: aprobadas / con hallazgos / con errores (como ejecutor y
  como revisor, por separado).
- Tiempo promedio hasta aprobación (rondas necesarias por tarea).
- Categorías de error más frecuentes (agrupando `ReviewCheck.result=FAILED` por `category`),
  para detectar patrones — este es el punto central del enfoque "PSP ligero" (2.6.3):
  detección de errores + calidad + cumplimiento + UX + patrones + mejora continua, **sin**
  métricas de código (líneas, tiempo por línea, etc.).

## Por qué no se implementó ahora

Este documento por sí solo ya es ~10 tablas nuevas + permisos + 3-4 pantallas + reportes.
Construirlo sin poder probarlo con calidad en la misma sesión hubiera dejado tablas huérfanas
sin UI, que es peor que no tocarlas. Se prioriza entregarlo como especificación clara para
que se implemente en una sesión dedicada.
