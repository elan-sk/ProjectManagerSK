# Plan — Especificación 002

## Inventario de impacto

Entidades que cambian: el envío de ronda de Prueba (`submitReviewRound`) y la plantilla por defecto (`Task.defaultTestTemplateId`).

| Consumidor | Estado |
|---|---|
| `reviewActions.ts` `submitReviewRound` (`.min(1)` + mensaje) | ✅ se ajusta — RF-1, RF-2, RF-4 |
| `ReviewPanel.tsx` `SubmitRoundForm` (botón deshabilitado y `return` sin ítems) | ✅ se ajusta — RF-1, RF-2 |
| API `POST /tasks/:id/review/rounds` (`bodySchema .min(1)`) | ✅ se ajusta — RF-5 (`deliverables` opcional, default `[]`) |
| `taskDesign.ts` `designReviewTask` (rechazo 400 si QA sin entregable) | ✅ se ajusta — RF-5 |
| Bot: descripción de `design_task` y regla en `chontatec.ts` | ✅ se ajusta — RF-9 |
| Skill del repo `.claude/skills/project-manager-sk/SKILL.md` (líneas 228 y rondas) | ✅ se ajusta — RF-9 |
| Reenvío: respuesta + evidencia por prueba con error | ➖ no cambia (RF-3), se deja el código tal cual |
| Evidencia para calificar con error/hallazgo | ➖ no cambia (fuera de alcance) |
| `ReviewPanel` `ActiveRound`: chips de entregables con lista vacía | ➖ no aplica: `FileChips` con `[]` no dibuja nada; «+ agregar» sigue disponible |
| `publicView.ts` (link del cliente: `deliverables`) | ➖ no aplica: lista vacía ya es válida |
| `GET /projects/:id` y `claude-link` (devuelven `deliverables`) | ➖ no aplica: lista vacía |
| `notifyReviewRequested` (WhatsApp/aviso al revisor) | ➖ no aplica: no menciona entregables |
| Aceptación (`submitAcceptanceRound`) | ➖ fuera de alcance |
| Página de tarea `page.tsx` → `ReviewPanel` | ✅ se ajusta — RF-6: pasar `defaultTestTemplateId` |
| `setDefaultTestTemplate` (`taskDesign.ts`) | ✅ se reutiliza tal cual (permiso `canReviewTask`, bloqueo si completada) — RF-6 |
| Formulario nueva tarea y API de creación | ➖ ya permiten elegir plantilla, sin cambios |
| Bot `create_task` | ✅ se ajusta — RF-8 (`reviewerIds`, `defaultTestTemplateId`) |
| Bot: listar plantillas (no existe) | ✅ se agrega `list_test_templates` (lectura, regla `canManageTemplates`) — RF-8 |
| Bot: cambiar plantilla (no existe) | ✅ se agrega `set_test_template` (escritura con confirmación) — RF-8 |
| Duplicar tarea (`taskOps.ts` copia `defaultTestTemplateId`) | ➖ no aplica: sigue copiándola |

## Cambios por archivo

1. **`reviewActions.ts`** — `submitReviewRound`: quitar `.min(1)` del array (RF-1/2); mantener validación de links (RF-4). Nueva acción `setDefaultTestTemplateAction(taskId, templateId|null)` que llama a `setDefaultTestTemplate(taskId, await resolveActor(), templateId)` y revalida (RF-6). Se reutiliza la función de `taskDesign.ts`, no se duplica la regla.
2. **`ReviewPanel.tsx`** — `SubmitRoundForm`: el botón «Enviar» habilitado sin ítems; texto de ayuda corto: «Adjuntar un link o archivo es opcional.» (RF-1/2). Nuevo bloque `DefaultTemplatePicker` mientras `rounds.length === 0 && !isDone`: con `canReview` un `<select>` (Ninguna + plantillas) que guarda al cambiar; sin `canReview` solo el nombre (o nada si no hay) (RF-6/7).
3. **`page.tsx`** (tarea) — pasar `defaultTestTemplateId={task.defaultTestTemplateId}`.
4. **API `review/rounds/route.ts`** — `deliverables` `.default([])` (RF-5).
5. **`taskDesign.ts`** — quitar el `fail(400…)` de QA sin entregable y su comentario (RF-5).
6. **`chontatecTools.ts`** — `create_task`: `reviewerIds` y `defaultTestTemplateId` opcionales (solo QA) → `formData` que `addTask` ya lee. Nueva lectura `list_test_templates` y escritura `set_test_template` (en `WRITE_TOOLS` de miembros: el permiso real lo valida `setDefaultTestTemplate`), con su resumen para el botón de confirmación. Descripción de `design_task` sin «exige deliverables» (RF-8/9).
7. **`chontatec.ts`** — regla de diseño: entregables opcionales en Prueba; mencionar `list_test_templates`/`set_test_template` (RF-9).
8. **`SKILL.md`** del repo — entregable opcional en rondas y en diseño de Prueba (RF-9).

## Decisiones técnicas
- Reusar `setDefaultTestTemplate` desde la acción web (alternativa descartada: regla nueva en `reviewActions`, duplicaría permisos). `taskDesign.ts` ya importa `reviewActions.ts`; la importación inversa es circular pero solo de funciones usadas en ejecución, sin problema.
- No se agrega script `verify-*`: el cambio quita una restricción y reusa una función existente, no hay lógica nueva pura que aislar. Verificación: `tsc`, `lint` y lectura de código; prueba visual queda para el usuario.

## Verificación
`npx tsc --noEmit`, `npm run lint`, `grep` de que no quedan `min(1)`/«al menos un entregable» en el flujo de Prueba.
