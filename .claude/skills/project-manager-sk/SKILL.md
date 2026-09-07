---
name: project-manager-sk
description: Consultar, crear y modificar proyectos, cronogramas y tareas en la API de ProjectManagerSK (este mismo repo). Usar cuando el usuario pida ver el estado de un proyecto, crear tareas, mover el estado de una tarea, o preguntar por atrasos/cuellos de botella.
---

# ProjectManagerSK API

API REST del propio sistema de gestión de proyectos (Next.js + Prisma, este repo). Corre en `http://localhost:3000` en desarrollo.

## Autenticación

Todas las rutas requieren el header:

```
Authorization: Bearer <API_KEY>
```

El valor de `API_KEY` está en el archivo `.env` de la raíz del proyecto — leerlo de ahí, nunca hardcodear ni pedírselo al usuario.

## Endpoints

### Proyectos

- `GET /api/v1/projects` — lista todos los proyectos (con PM y fases).
- `POST /api/v1/projects` — crea un proyecto.
  ```json
  { "name": "string", "clientName": "string?", "countryCode": "CO", "startDate": "2026-09-07", "pmId": "string" }
  ```
- `GET /api/v1/projects/:id` — detalle completo: fases, tareas con asignados, más `bottlenecks` (cuellos de botella) y `delays` (atrasos por tarea, ver regla abajo).

### Tareas

- `GET /api/v1/projects/:id/tasks` — lista las tareas de un proyecto.
- `POST /api/v1/projects/:id/tasks` — crea una tarea.
  ```json
  {
    "phaseId": "string",
    "title": "string",
    "type": "SIMPLE | CHECKLIST | MILESTONE | MEETING | QA | ADJUSTMENT",
    "plannedStart": "2026-09-07",
    "durationDays": 3,
    "assigneeIds": ["userId"],
    "dependsOnTaskIds": ["taskId"]
  }
  ```
  `plannedEnd` se calcula solo en días hábiles (festivos del país del proyecto vía Nager.Date, sin cargarlos a mano).
- `GET /api/v1/tasks/:id` — detalle de una tarea, incluye `delayDays` si está completada.
- `PATCH /api/v1/tasks/:id` — modifica estado/título/riesgo.
  ```json
  { "status": "IN_PROGRESS | BLOCKED | COMPLETED | NOT_STARTED" }
  ```
  Si la tarea tiene pasos de checklist sin marcar, `status: "COMPLETED"` devuelve **409** — no se puede completar sin terminar el checklist (regla del sistema, no un bug).

## Regla de atrasos (importante para no malinterpretar `delays`)

Una tarea solo aparece en `delays` si **su propia duración real** superó la planeada — no por haber arrancado tarde porque una tarea de la que dependía se demoró. Si el usuario pregunta "¿quién generó el atraso?", la respuesta está en este campo, no en comparar fechas de fin a simple vista.

## Ejemplo (curl)

```bash
API_KEY=$(grep API_KEY .env | cut -d= -f2 | tr -d '"')
curl -s http://localhost:3000/api/v1/projects -H "Authorization: Bearer $API_KEY"
```
