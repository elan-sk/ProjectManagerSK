# Plan 013 — Chat del bot por WhatsApp

Diagrama del cambio: [change-diagram.png](change-diagram.png) (fuente `change-diagram.dot`).

## Inventario de impacto

| Consumidor | Estado | RF |
|---|---|---|
| `src/lib/chontatec.ts` (historial, acción pendiente, borrar, loop) | ✅ filtra por canal; contexto del otro canal; línea de canal y respuestas cortas en el system prompt | RF-29, 30, 32, 33, 34 |
| `src/app/(app)/chontatecActions.ts` + `ChontatecWidget.tsx` | ✅ pasan canal `web` (sin cambio visible) | RF-29, 34 |
| `src/lib/chontatecTools.ts` | ✅ herramienta nueva `send_to_other_channel` (solo a uno mismo); `read_uploaded_file` sigue por usuario (un archivo mandado por WhatsApp también se lee desde la app: misma persona) | RF-31, 18 |
| `src/auth.ts` → los 24 módulos que llaman `auth()` / `resolveActor()` | ✅ un solo punto: dentro del contexto de WhatsApp, `auth()` devuelve al usuario identificado por número | RF-3 |
| `src/lib/whatsapp.ts` | ✅ escucha `messages.upsert` y `messages.update` (votos); envío de respuesta, documentos y encuesta; modo prueba `WHATSAPP_ONLY_PHONE` también para entrantes | RF-1, 4, 13, 21 |
| Notificaciones (`notifications.ts`, `sessionUserId`) | ✅ sin cambio de código: la persona que actúa por WhatsApp queda excluida de su propio aviso gracias al punto anterior | RF-3 |
| Tope y uso del bot (`checkAndConsumeBotQuestion`, `BotUsage`) | ✅ mismo camino de `sendChontatecMessage` | RF-8 |
| Configuración → Bot (`botSettings.ts`, `botActions.ts`, `BotSettingsForm.tsx`) | ✅ interruptor «Responder por WhatsApp» | RF-5 |
| Mensaje de bienvenida de fábrica (`buildDefaultBotIntroMessage`) | ⚠️ hoy dice «si entrás a la aplicación, también podés preguntarme…»: queda desactualizado. Ver sugerencia S-1 | — |
| Cola de horario laboral / scheduler | ➖ las respuestas no pasan por la cola (RF-12); el vigilante de conexión no cambia | RF-12 |
| Resumen diario, alertas, grupos | ➖ no se tocan; se verifica que sigan igual | criterio |
| API v1 / link «Conectar IA» | ➖ usan `trustedActor`; el contexto de WhatsApp solo existe dentro de la entrada interna | — |
| `userDeletion.ts`, `fileReferences.ts`, `archivedImageCompression.ts`, `wipe-except-users.ts` | ➖ trabajan por `userId` o por contenido; la columna nueva no los afecta | — |
| Respaldo total (`api/backup/full`) | ➖ recorre todas las tablas y columnas de forma genérica | — |
| Deploy (`deploy-vps.yml`, `next.config.ts`) | ✅ excluir la carpeta del modelo de voz del `rsync --delete`; paquetes nativos fuera del bundle | RF-22 |
| Avisos de novedad (`featureHints.ts`) | ⚠️ ver sugerencia S-2 | — |

## Archivos

**Nuevos**
- `src/lib/actorContext.ts` — `AsyncLocalStorage` con `{ userId, role, name, channel }` y `runAsUser()`. RF-3.
- `src/lib/whatsappChat.ts` — recepción: filtros (propio, grupo, estado, difusión, interruptor, modo prueba), número real (`key.remoteJidAlt` o `lidMapping.getPNForLID`), usuario por dígitos (ambiguo o inexistente → nada), cola por persona, tipo de mensaje (texto, imagen, documento, audio, otro), llamada a la entrada interna, formato y envío de la respuesta, encuesta y votos. RF-1, 2, 4, 5, 10, 11, 13–16, 18–28.
- `src/lib/voiceTranscription.ts` — `ffmpeg` → PCM 16 kHz mono → Whisper base (`@huggingface/transformers`, `language: "spanish"`), carga perezosa del modelo, una transcripción a la vez, tope de 5 min. RF-22, 24, 25, 27.
- `src/lib/whatsappFormat.ts` — Markdown del bot → texto de WhatsApp (negritas, `[[person|project|status|alert]]` → nombre, links relativos → absolutos, títulos, tablas → líneas), partir en mensajes de ~3.500 caracteres sin cortar palabras, extraer rutas `/uploads/…` para mandarlas como documento, interpretar «sí/no». Funciones puras. RF-9, 15, 21.
- `src/lib/chatUploadNote.ts` — arma el texto «[Archivos subidos en el chat: …]» (hoy está escrito a mano en el widget); lo usan el widget y WhatsApp. RF-18.
- `src/app/api/whatsapp/chat/route.ts` — entrada interna (POST): valida un secreto aleatorio del proceso (nunca sale del servidor), corre `sendChontatecMessage` o `confirmChontatecAction` dentro de `runAsUser`, devuelve los mensajes nuevos. RF-3, 6, 15.
- `scripts/verify-whatsapp-chat.ts` — chequeo ejecutable: formato, partición, «sí/no», normalización de teléfono, que `auth()` devuelva al usuario dentro del contexto y nada fuera de él.
- Migración Prisma: `BotMessage.channel String @default("web")` + índice `[userId, channel, createdAt]`; `AppSetting.botWhatsappChatEnabled Boolean @default(false)`.

**Modificados**
- `src/auth.ts` — `auth` exportado pasa a ser un envoltorio: con contexto de WhatsApp y sin argumentos devuelve la sesión del usuario identificado; si no, llama al `auth` de NextAuth tal cual.
- `src/lib/chontatec.ts` — parámetro `channel` en `sendChontatecMessage`, `confirmChontatecAction`, `getChontatecHistory`, `clearChontatecHistory` (por defecto `web`); `persistRow`, `loadHistory`, `getPendingAction` y `currentHistory` filtran por canal; bloque de system prompt con el canal, los últimos 10 textos del otro canal y la regla de respuestas cortas en WhatsApp; `pathname` vacío en WhatsApp.
- `src/lib/chontatecTools.ts` — `send_to_other_channel` (lectura, sin confirmación, solo a uno mismo): desde la app → WhatsApp propio; desde WhatsApp → mensaje en el chat de la app.
- `src/lib/whatsapp.ts` — registra los dos eventos nuevos (delegando en `whatsappChat.ts`), `getMessage` para descifrar votos, y `sendChatReply(jid, partes, documentos)` / `sendConfirmPoll(jid, texto)` sin el encabezado «🤖 Nombre» en cada mensaje (la bienvenida con foto se manda igual la primera vez).
- `src/lib/botSettings.ts`, `src/app/(app)/settings/botActions.ts`, `BotSettingsForm.tsx` — interruptor (solo admin).
- `src/app/(app)/ChontatecWidget.tsx` — usa `chatUploadNote`.
- `next.config.ts` — `serverExternalPackages` + `@huggingface/transformers`, `onnxruntime-node`, `ffmpeg-static`.
- `.github/workflows/deploy-vps.yml` — `--exclude='.models-cache/'`; `.gitignore` — `.models-cache/`.
- `package.json` — `@huggingface/transformers@4.3.1` (publicada 2026-10-06) y `ffmpeg-static@5.3.0`.

## Qué se reutiliza
- Motor del chat completo (`sendChontatecMessage`, `confirmChontatecAction`, herramientas, permisos, tope, mensajes de error).
- `saveUploadedFile` (tipos y tamaños permitidos, mismos errores), `findUploadPath`, `appUrl`, `TASK_STATUS_LABEL`, `summarizeWriteTool`, `isDestructiveTool`, el patrón `globalThis` de `whatsapp.ts`.
- Desde cero: recepción de mensajes, transcripción y formato de WhatsApp (no existe nada parecido en el repo).

## Lógica principal

```
messages.upsert (type "notify"):
  por cada mensaje:
    si fromMe | grupo | status@broadcast | newsletter | interruptor apagado | modo prueba lo bloquea → nada
    phone = dígitos(remoteJidAlt ?? (remoteJid es @lid ? lidMapping.getPNForLID : remoteJid))
    usuarios activos con ese teléfono (por dígitos): 0 → nada; >1 → log, nada
    encolar por userId:
      texto → post(texto)
      imagen/documento → descargar → saveUploadedFile → error? responder error : post(texto o «Subí este archivo.» + chatUploadNote)
      audio → seconds > 300 ? aviso : transcribir → vacío/falla ? aviso : post(transcripción, eco)
      otro → aviso RF-26
post(texto):
  si hay acción pendiente en WhatsApp y texto es sí/no → /api/whatsapp/chat {confirm}
  si no → /api/whatsapp/chat {message}
  respuesta nueva → formatear → (eco 🎤) → enviar partes + documentos
  si el último mensaje trae pendingAction → advertencia si irreversible → encuesta ✅ Confirmar / ❌ Cancelar
messages.update con pollUpdates:
  encuesta conocida (memoria) → voto agregado → confirm/decline como arriba; desconocida → nada (sirve escribir sí/no)
```

## Decisiones técnicas
- **Entrada interna por HTTP local** (`127.0.0.1:${PORT ?? 3000}`) en vez de llamar al motor desde el evento de Baileys: varias acciones refrescan páginas con `revalidatePath`, y Next 16 lo rechaza fuera de una petición («static generation store missing»). Descartado: envolver cada `revalidatePath` (decenas de archivos). Riesgo: si el VPS arranca en otro puerto sin `PORT`, falla; se verifica `PORT` en el VPS al desplegar.
- **Identidad en `auth()`** con `AsyncLocalStorage`: un solo punto cubre los 24 módulos que hoy leen la sesión. Descartado: pasar el actor a mano por cada herramienta y acción.
- **Votos de la encuesta en memoria**: si el servidor se reinicia entre la propuesta y el voto, el voto no se puede leer; la persona puede escribir «sí» o «no». Descartado: guardar las encuestas en la base (más tablas para un caso raro).
- **Whisper base con `@huggingface/transformers`** (Node, ONNX) en vez de whisper.cpp: se instala con npm, sin compilar en el VPS. El modelo (~80 MB) se descarga la primera vez a `.models-cache/`.
- **`ffmpeg-static`** para leer el audio de WhatsApp (OGG/Opus) y otros formatos, sin depender de que el VPS tenga ffmpeg instalado.

## Verificación
- `npx tsc --noEmit`, `npm run lint`, `npx tsx scripts/verify-whatsapp-chat.ts`.
- Transcripción: script con un audio de prueba en español generado localmente (sin WhatsApp), midiendo el tiempo.
- Prueba real por WhatsApp (texto, archivo, audio, confirmación con encuesta y con «sí»): solo con su autorización, desde su número personal, nunca en grupos.

## Sugerencias (no incluidas; se aplican solo si las aprueba)
- **S-1. Bienvenida de fábrica**: cambiar «Y si entrás a la aplicación, también podés preguntarme…» por «También se me puede escribir o mandar una nota de voz por este mismo chat para consultar o pedir cambios.» Solo afecta a quien no tenga un mensaje de bienvenida propio.
- **S-2. Aviso de novedad**: como el interruptor empieza apagado, publicar el aviso solo cuando lo enciendan (lo agrego después, con este texto: «Nuevo: el asistente por WhatsApp — Ahora también se le puede escribir o mandar notas de voz al WhatsApp del asistente.»).
