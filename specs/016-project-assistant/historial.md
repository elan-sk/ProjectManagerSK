# Historial — 016 Asistente de proyectos y clientes

- 2026-11-05 — Modo chat (sin link PMSK). Fuentes: spec 015, chontatec.ts / companyAssistant.ts / chontatecTools.ts (create_project, manage_phase/objective/requirement, create_task), projects/actions.ts, consumidores de clientName. Biblioteca Depura no disponible (MCP sin conexión): no se hizo barrido.
- 2026-11-05 — Entrevista (3 rondas): admins y PM; lista Clientes en Empresa (propuesta del usuario); PM elige/crea; migrar clientName; definición + cronograma; confirmación por bloques; perfil vacío: admin primero, PM sigue; entradas Crear/Completar con asistente; proyectos parecidos como referencia (sugerencia aceptada); ficha = datos + Perfil libre.
- 2026-11-05 — Spec 016 redactada (borrador), pendiente de aprobación.
- 2026-11-05 — Cambio pedido al revisar: asistente de clientes (RF-38) e investigación en internet (RF-39 a RF-45). DeepSeek tiene web_search por su endpoint Anthropic (api-docs.deepseek.com/guides/anthropic_api).
- 2026-11-05 — Spec 016 aprobada (45 RF). Plan + diagrama redactados, pendientes de aprobación.
- 2026-11-05 — Plan aprobado. Trabajo directo en master (AGENTS.md: sin ramas).
- T1 — Client + Project.clientId; migración 20261107120000_clients aplicada en local con migrate deploy (sin permiso de shadow DB); linkLegacyClients en instrumentation. verify ok.
- T2 — ClientPicker (SearchableSelect allowCustom, opciones por acción) en «+ Nuevo proyecto», subproyecto y edición; API POST/PATCH proyectos y bot create/update_project con clientFieldsFor; import une clientes. tsc ok.
- T3 — Empresa → bloque Clientes; ficha /clients/[id] (editar/eliminar solo admin; PM de solo lectura), /clients/new; API /api/v1/clients; bot list_clients/get_client/save_client. Cambio frente al plan: rutas /clients/… en vez de /company/clients/… (una sola ficha para admin y PM). verify ok.
- T4 — Lectura de páginas reutiliza el lector seguro de pageTitle.ts (fetchPageText, bloqueo de IP internas); webSearch.ts con web_search_20250305 para anthropic/deepseek, tope 5 por canal; motor con pause_turn. verify ok.
- T5 — GuidedAssistant (pantalla común); CompanyAssistant como envoltorio; empresa con read_web_page + búsqueda. verify:company-profile ok.
- T6 — manage_requirement con objectiveTitles, set_task_dependency por títulos, create_project con descripción y cierre; resúmenes de confirmación con detalle.
- T7 — projectAssistantSteps (8 pasos; la spec decía 9 por error de conteo, corregido), similarProjects, projectAssistantMode / clientAssistantMode.
- T8 — /projects/assistant(?project=) y /clients/assistant; AssistantEntryButton en Proyectos y encabezado del proyecto; la conversación project:new pasa a project:<id> al confirmar el bloque 1.
- T9 — chatMode ofrece el link a admin y PM (web y WhatsApp); avisos project-assistant y company-clients.
- T10 — tsc ok, lint sin errores, verify:project-assistant ok, verify:company-profile ok. Pendiente prueba visual (sin autorización de navegador).
- 2026-11-06 — Cambio de alcance aprobado: asistente de tareas + seed desde el chat (RF-46 a RF-55).
- 2026-11-06 — Implementado el asistente de tareas (/tasks/assistant, canales task:new:<proyecto> y task:<tarea>, 7 pasos, tipo deducido por preguntas), botón dentro del popup «Nueva tarea» (lleva título y descripción escritos) y «Completar con asistente» bajo las etiquetas de la tarea; punto de partida desde el chat (from=chat, últimos mensajes de 24 h) también en el asistente de proyectos; el chat ofrece el asistente adecuado en pedidos complejos. tsc, lint y verify ok.
