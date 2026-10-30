# Historial — 014

- 2026-10-29 — Fuentes: conversación (estudio de costos, captura del bloqueo), código (whatsapp.ts, whatsappChat.ts, botSettings.ts, settings), docs de Meta (precios, ventana 24 h, typing indicator, webhook, grupos) vía WebFetch y Context7. Base local: 9 personas, 1 grupo. Producción: no se pudo (clave SSH con frase, sin agente).
- 2026-10-29 — Entrevista: selector manual; grupos por privado; una plantilla general; tope 1.500/mes, cuenta ambas conexiones, pausa avisos automáticos; pausas solo QR.
- 2026-10-29 — Biblioteca: no se consultó (funcionalidad interna de PMSK sin componentes de la biblioteca).
- 2026-10-29 — Cambio antes de aprobar: pedidos al bot por mención en el grupo (RF-24 a RF-34, RF-3 modificado). Decisiones: QR solo para grupo, preguntas por QR, contexto = mensajes anteriores (20/3 h), no registrados se ignoran.
- 2026-10-30 — Cambio antes de aprobar: mensajes reenviados al bot como pedido (RF-35 a RF-37), juntando reenvíos seguidos (5 s).
- 2026-10-30 — Spec aprobada.
- 2026-10-30 — Plan y tareas escritos; diagrama change-diagram.png generado y revisado.
- 2026-10-30 — Plan aprobado. Implementación en master (regla del proyecto: sin ramas).
- 2026-10-30 — T1: columnas nuevas + migración 20261030120000_whatsapp_cloud_api (aplicada en local con migrate deploy).
- 2026-10-30 — T2: whatsappCloudFormat.ts + verify:whatsapp-cloud (OK).
- 2026-10-30 — T3: whatsappUsage.ts (contador, tope, aviso 80/100 % a administradores en la app).
- 2026-10-30 — T4: whatsappCloud.ts (cliente Graph v24.0, errores en lenguaje simple, token y clave cifrados).
- 2026-10-30 — T5: envíos según conexión; grupo → privado con API; pausas solo QR; motivo de falla con tope/API.
- 2026-10-30 — T6-T8: chat con dos transportes, webhook /api/whatsapp/cloud, reenvíos juntos (5 s), menciones en grupo + post_group_result.
- 2026-10-30 — T9: Configuración (selector, datos de Meta, tope), casilla en Bot, alarma, arranque, borrado de usuario, 2 avisos de novedad.
- 2026-10-30 — Verificación: tsc OK, eslint OK (3 avisos previos), verify:whatsapp-cloud/whatsapp-chat/bot-history/bot-openai/bot-usage-reset/delete-user OK.
- 2026-10-30 — Validación: webhook en local (token malo 403, token bueno devuelve el reto, POST sin firma 401); /settings compila. Sin probar en vivo: envíos reales por Meta y menciones en un grupo real. Estado: implementada.
