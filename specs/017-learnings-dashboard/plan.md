# Plan 017 — Aprendizajes y tablero de la empresa

Spec: [spec.md](spec.md) (aprobada 2026-11-06). Diagrama: [change-diagram.png](change-diagram.png).

## Inventario de impacto

| Consumidor | Estado |
|---|---|
| Empresa (`company/page.tsx`, `CompanyPageView.tsx`) | ✅ secciones «Tablero» y «Aprendizajes» (RF-2–5, RF-10) |
| Proyecto → Definición (`DefinitionTab.tsx`) | ✅ sección «Aprendizajes» (RF-6, RF-7) |
| Rendimiento (`delays.ts`, `reviewPerformance.ts`) | ➖ no cambia: el catálogo reutiliza sus funciones |
| Archivar proyecto (`taskOps.ts setProjectArchived`) | ✅ aviso (RF-12) |
| Completar tarea (`actions.ts updateTaskStatus`, y la ronda que completa una Prueba/Aceptación) | ✅ si la fase queda completa, aviso (RF-12) |
| Tareas programadas (`scheduler.ts`) | ✅ aviso de inicio de mes (RF-12) |
| Campana / push (`notify`, tipo SYSTEM) | ✅ reutiliza; sin WhatsApp (decisión) |
| Chat (`chontatecTools.ts`) | ✅ `get_learnings`, `set_learning_status`, `get_team_performance` (RF-13, RF-15) |
| Asistentes (`similarProjects.ts`) | ✅ suma los aprendizajes de los proyectos parecidos (RF-14) |
| API v1 | ✅ `/indicators`, `/learnings` (RF-11) |
| Eliminar proyecto | ✅ sus aprendizajes se ocultan (filtro por proyecto vivo); borrado en cascada al borrar de verdad |
| Exportar/importar, copias | ➖ copias de la base completa los incluyen; export por proyecto no los lleva (fuera de alcance) |
| Link compartido del cliente | ➖ nunca los muestra |
| Buscador | ➖ no busca aprendizajes (no pedido) |

## Datos
```prisma
enum LearningStatus { PROPOSED APPLIED DISCARDED }
model Learning {
  id, projectId? (Cascade), personId? (SetNull), topic, title Text, evidence Text, recommendation Text,
  status LearningStatus @default(PROPOSED), cutoff String?, source String ("app" | "claude"),
  createdById?, createdAt, updatedAt
}
model LearningPrompt { key String @id, createdAt }   // un aviso por evento (proyecto, fase o mes)
```
Migración `20261108120000_learnings`.

## Archivos
**Nuevos**
- `src/lib/companyIndicators.ts`: catálogo (clave, título, temas para ordenar por intención) y `computeIndicators({ projectIds, from, clientId })`. Reutiliza `getProjectReport`, `getUserPerformance`, `getReviewPerformance` (QA y ACCEPTANCE), `getCommonFailureCategories`, `getTeamContribution` y consultas cortas para duración real vs. planeada, ajustes por proyecto y proyectos por cliente. El período se aplica a los proyectos con actividad en él (tareas que terminan o terminaron dentro del período). `rankByIntent(indicators, texto)` ordena por coincidencia con «Qué quiere revisar».
- `src/lib/learnings.ts`: permisos (`learningVisibleWhere`: admin todo; PM solo de sus proyectos y sin persona), `listLearnings`, `saveLearning`, `setLearningStatus`, `deleteLearning`, `generateLearnings(scope)` (arma el texto de indicadores, llama a la IA conectada con una sola herramienta `propose_learnings`, valida que cada uno traiga evidencia y tema válido, guarda todo junto o nada), `promptLearningsOnce(key, users, message, projectId)`.
- `src/app/(app)/company/CompanyDashboard.tsx` (gráficos con `BarChart`/`DonutChart`/`TrendBars`) y `LearningsPanel.tsx` (tarjetas, filtros, generar, retrospectiva), compartido entre Empresa y el proyecto.
- `src/app/(app)/learningActions.ts` (acciones de servidor con los permisos de `learnings.ts`).
- `src/app/api/v1/indicators/route.ts`, `src/app/api/v1/learnings/route.ts` y `[id]/route.ts`.
- `scripts/verify-learnings.ts` + `npm run verify:learnings`.

**Cambian**
- `prisma/schema.prisma`, `CompanyPageView.tsx` + `company/page.tsx` (menú lateral: Tablero, Aprendizajes), `DefinitionTab.tsx`, `taskOps.ts`, `actions.ts` (estado de tarea), `scheduler.ts`, `chontatecTools.ts`, `similarProjects.ts`, `featureHints.ts`.

## Lógica principal
```
generateLearnings(scope = proyecto | período):
  indicadores = computeIndicators(scope)      # números de la app, nunca consulta libre
  existentes = aprendizajes del alcance
  IA(reglas: 3-7, citar cifras, no repetir, temas válidos, persona solo si el dato es de una persona)
  → propose_learnings([...])
  validar (evidencia con al menos un número, tema del catálogo, persona existente) → guardar todos o ninguno
fase completa: al completar una tarea, si todas las de su fase quedan completas → promptLearningsOnce("phase:<id>")
mes: el scheduler, el día 1 → promptLearningsOnce("month:AAAA-MM")
archivar: promptLearningsOnce("project:<id>")
```

## Decisiones técnicas
- **Una llamada directa a la IA con una sola herramienta de respuesta** (no el motor del chat): no queda conversación, se valida el resultado y se guarda todo o nada. Alternativa descartada: usar el chat, que guardaría historial y podría pedir confirmaciones sueltas.
- **Avisos con `notify` tipo SYSTEM** (campana y push), sin migrar el enum. **Un aviso por evento** con la tabla `LearningPrompt` (clave única).
- **El tablero no guarda nada**: se calcula al abrir; el período se aplica por proyectos con actividad, reutilizando las funciones de Rendimiento que filtran por proyectos.

## Avisos de novedad (RF-20) — textos para aprobar
- `company-dashboard` (Empresa, sección Tablero): **«Tablero de la empresa»** — «Los indicadores de la empresa en un solo lugar, primero los que más le interesan según su perfil.»
- `company-learnings` (Empresa, botón Generar): **«Aprendizajes»** — «Conclusiones con su evidencia y recomendación, sacadas de los datos de los proyectos. Se marcan como aplicadas o descartadas.»
- `project-learnings` (Proyecto → Definición): **«Aprendizajes del proyecto»** — «Lo que deja este proyecto para los siguientes, con su evidencia. Se generan cuando se pide.»

## Verificación
- `tsc`, lint, `verify:learnings` (indicadores con proyecto de prueba, permisos por rol, rechazo sin evidencia, un solo aviso por evento), `verify:project-assistant` y `verify:company-profile`.
- Pendiente de navegador: gráficos, responsive, generación real con DeepSeek.

## Cobertura
RF-1 companyIndicators · RF-2–4 CompanyDashboard · RF-5–7 LearningsPanel + learnings.ts · RF-8–9 generateLearnings · RF-10 retrospectiva · RF-11 API · RF-12 avisos · RF-13–15 chat · RF-14 similarProjects · RF-16–18 permisos y errores · RF-19 responsive · RF-20 featureHints.
