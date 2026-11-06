# Plan 015 — Asistente y perfil de la empresa

Diagrama: [change-diagram.png](change-diagram.png)

## Inventario de impacto

| Consumidor | Estado |
|---|---|
| Configuración (`settings/page.tsx`) | ✅ sección «Empresa» solo admin (RF-1..6, RF-29) |
| Chat flotante (`ChontatecWidget.tsx`) | ✅ se extraen sus piezas a componentes compartidos, sin cambio visible (reutilización) |
| Motor del chat (`chontatec.ts`) | ✅ el bucle recibe un «modo» (reglas + herramientas + canal); el chat normal queda igual (RF-7..15, RF-20..22, RF-30..33) |
| Herramientas del bot (`chontatecTools.ts`) | ✅ nueva `get_company_profile` (lectura, filtrada por rol); `create_task` sin cambio de código, la equivalencia de tipos va en el contexto (RF-20, RF-21, RF-33) |
| Chat por WhatsApp (`whatsappChat.ts`) | ✅ usa el mismo motor: recibe `get_company_profile`, el ofrecimiento con link y los tipos de tarea, sin tocar el archivo (RF-30, RF-33) |
| Historial `BotMessage.channel` | ✅ valor nuevo `company`; `loadOtherChannelExcerpt` no mezcla ese canal con web/WhatsApp; `send_to_other_channel` no está en el modo asistente (RF-14) |
| `read_uploaded_file` | ➖ no cambia: ya valida contra los mensajes propios de cualquier canal |
| Tope mensual y `BotUsage` | ✅ cada mensaje del asistente pasa por `checkAndConsumeBotQuestion` (RNF) |
| Transcripción (`voiceTranscription.ts`) | ✅ se reutiliza tal cual desde una ruta nueva; WhatsApp no cambia (RF-18, RF-19, RF-25) |
| API v1 | ✅ `GET /api/v1/company-profile` (filtrado por rol) y `PATCH` de un tema (solo admin). Por la regla de paridad app-bot-API y porque la entrega 3 la lee desde Claude (RF-35, nuevo) |
| Respaldo completo (`api/backup/full`) | ➖ recorre todas las tablas: las nuevas entran solas |
| Exportar (`api/export`) | ➖ exporta proyectos y tareas, no configuración |
| Eliminar usuario (`userDeletion.ts`) | ➖ `updatedById`/`addedById` sin relación: el perfil no depende del usuario |
| Buscador, filtros, tablero, Gantt, reportes, Rendimiento | ➖ no muestran datos de la empresa |
| Avisos, resumen diario, colas, tareas programadas | ➖ no usan el perfil |
| Link compartido del cliente | ➖ nunca muestra el perfil |
| Avisos de novedad (`featureHints.ts`) | ✅ entrada nueva en `/settings`; solo se ve si el elemento está visible, es decir, solo admin (RF-27) |

Consumidor que la spec no contemplaba: **API v1**. Se agrega como RF-35 por la regla ya acordada («toda acción de la app va también al bot y a la API con el mismo permiso»), con la excepción ya aprobada de que el chat no escribe el perfil (RF-22).

## Datos (migración)

```prisma
model CompanyProfileTopic {
  key         String   @id
  text        String?  @db.Text
  skipped     Boolean  @default(false)
  updatedAt   DateTime @updatedAt
  updatedById String?
}

model CompanyDocument {
  id        String   @id @default(cuid())
  url       String
  name      String
  mimeType  String
  addedById String?
  createdAt DateTime @default(now())
}

model CompanyTaskTypeMeaning {
  type     TaskType @id
  meaning  String?  @db.Text
  unused   Boolean  @default(false)
}
```
- `AppSetting.companyAssistantFocus String?`: el tema «en curso» (RF-8).
- Una fila por tema: dos administradores que guardan temas distintos no se pisan, y en el mismo tema queda el último (caso límite).
- El nombre de la empresa es la clave `name`, que no cuenta en el avance.
- La migración se escribe a mano con `prisma migrate diff` (en local `migrate dev` no funciona) y corre en `npm run build`.

## Archivos

| Archivo | Qué hace | RF |
|---|---|---|
| `src/lib/companyProfile.ts` (nuevo, sin `"use client"`) | `COMPANY_TOPICS` (clave, nombre visible, público/delicado, orden): fuente única. Funciones puras `topicProgress`, `profileViewFor(role)` (filtro institucional/delicado), `taskTypeContext(meanings)` y `assistantFocusState`. Lectura y guardado con Prisma (`getCompanyProfile`, `saveCompanyTopic`, `skipCompanyTopic`, `addCompanyDocument`, `removeCompanyDocument`, `saveTaskTypeMeanings`) | 3, 8, 11, 12, 17, 21, 32 |
| `src/lib/companyAssistant.ts` (nuevo) | Modo «asistente» del motor: reglas (una pregunta por vez, feedback en una frase, saltar, repaso tema por tema, cierre a los 10, propuesta de tipos) + estado actual del perfil en el contexto. Herramientas: `company_topic` (ask / save / skip, se ejecuta al momento), `add_company_document` (al momento), `propose_task_type_meanings` (de escritura: usa el botón Confirmar existente), `read_uploaded_file` (reutilizada) | 9-15, 17, 32 |
| `src/lib/chontatec.ts` | `runConversationLoop` recibe un `mode` (`buildSystem`, `tools`, `writeNames`, `runImmediate`). El modo chat es el actual, sin cambios de comportamiento. Al contexto del chat normal se suman: equivalencia de tipos (si existe), avance del perfil y link al asistente (solo admin) | 20, 30, 31, 33 |
| `src/lib/actorContext.ts` | `ChatChannel` suma `"company"` | 14 |
| `src/lib/chontatecTools.ts` | Herramienta de lectura `get_company_profile` para todos, que responde con `profileViewFor(role)`. Las reglas: no dar consejos ni conclusiones de empresa a quien no es admin, y ofrecer el asistente una sola vez por conversación | 20-22, 30, 31 |
| `src/components/chat/ChatMessages.tsx` (extraído) | Lista de mensajes, burbuja con confirmar/cancelar e indicador «escribiendo», sacados de `ChontatecWidget` | 7, 32 |
| `src/components/chat/useChatAttachments.ts` (extraído) | Subir, arrastrar, soltar y pegar archivos, sacado de `ChontatecWidget` | 16 |
| `src/components/chat/renderMessage.tsx` (extraído) | `renderMessage` y las miniaturas, movidos sin cambios | 7 |
| `src/components/useVoiceRecorder.ts` (nuevo) | `MediaRecorder` con tope de 5 min, envío del audio a la ruta de transcripción, estados «Grabando» / «Transcribiendo…» y errores en lenguaje simple | 18, 19, 25 |
| `src/app/api/voice/transcribe/route.ts` (nuevo) | POST con sesión iniciada, recibe el audio, `transcribeAudio`, devuelve `{ text }` o el error. Va por ruta y no por server action porque esta corta el pedido en 1 MB | 18, 25 |
| `src/app/(app)/ChontatecWidget.tsx` | Usa las piezas extraídas; queda igual a la vista | — |
| `src/app/(app)/settings/company/actions.ts` (nuevo) | Acciones con el guard de admin: historial y estado, enviar, confirmar, empezar de nuevo, editar un tema, quitar un documento | 4, 6, 14, 26 |
| `src/app/(app)/settings/CompanySection.tsx` (nuevo) | Documento por tema, «Editar» en el lugar (Guardar al final), pendientes, documentos con visor (`useFileViewer`) y papelera (`useConfirm`), botones del asistente o el aviso de que falta la IA | 1-6, 23, 29 |
| `src/app/(app)/settings/company/assistant/page.tsx` + `CompanyAssistant.tsx` (nuevos) | Pantalla completa (portal, `fixed inset-0`). Columna de temas desde `lg`; por debajo, barra «tema · N de 10» desplegable. Conversación con las piezas compartidas, 📎, 🎤 y enviar. Quien no es admin ve «Esta sección es solo para administradores» | 7, 8, 16-19, 26, 28 |
| `src/app/(app)/settings/page.tsx` | Monta `CompanySection` para admin | 1 |
| `src/app/api/v1/company-profile/route.ts` (nuevo) | GET filtrado por rol con `resolveActor`; PATCH de un tema solo admin | 35 |
| `src/lib/featureHints.ts` | Aviso `settings-company` | 27 |
| `scripts/verify-company-profile.ts` + script `verify:company-profile` | Comprobaciones puras: filtro por rol, avance, en curso con saltados, contexto de tipos con y sin «No se usa» | 8, 21, 33 |

## Lógica principal

```
enviar(texto) en el asistente:
  guard admin → tope mensual → guardar mensaje (canal company)
  motor(modo asistente):
    sistema = reglas del asistente + persona del bot + perfil actual (temas, en curso, saltados, tipos)
    herramientas inmediatas: company_topic, add_company_document, read_uploaded_file
    herramienta con confirmación: propose_task_type_meanings
  devolver historial + estado del perfil (para refrescar la lista de temas)

company_topic(save): guarda el texto, skipped=false y deja «Guardado en «X»» como mensaje de sistema
company_topic(ask):  foco = X
company_topic(skip): skipped=true, foco = siguiente pendiente

contexto del chat normal (web y WhatsApp):
  + «Tipos de tarea en esta empresa: …» si hay equivalencia
  + admin: «Perfil de la empresa: N de 10 temas. Asistente: <APP_URL>/settings/company/assistant»
```

«Guardado en «X»» se muestra como el resultado de la herramienta (mensaje de sistema), igual que hoy los ✅ del chat.

## Decisiones técnicas
- **Un motor con modos**, no un segundo motor: se reutilizan tiempos límite, errores, proveedores, caché e historial. Se descarta copiar el bucle porque se duplicarían 150 líneas que ya se ajustaron varias veces.
- **Extraer piezas del chat flotante** en vez de reutilizar el componente completo con un interruptor: el widget tiene comportamiento de panel flotante (no leídos, atajos, abrir y cerrar) que el asistente no necesita.
- **Equivalencia de tipos en el contexto** del chat y no detrás de una herramienta: son unas 5 líneas, y así no depende de que la IA se acuerde de consultarla antes de `create_task`.
- **Grabar y transcribir por una ruta** y no por server action, por el límite de 1 MB.
- El texto de «Cómo trabaja» y la equivalencia de tipos se guardan por separado; la equivalencia solo con Confirmar (RF-32).

## Riesgo
- **Tiempo de transcripción**: Whisper corre en el procesador del VPS. Un audio de 5 minutos puede tardar más de lo que el proxy espera (unos 60 s si mantiene el valor por defecto). Se medirá en local con un audio de 5 min. Si supera ~50 s, se baja el tope de grabación del asistente (no el de WhatsApp) y se le avisa antes de cerrar.

## Texto del aviso de novedad (para aprobar)
- Título: «Nuevo: Empresa»
- Descripción: «Un asistente pregunta por la empresa, cómo trabaja y qué se quiere lograr con la aplicación, para que los consejos de la IA se ajusten a ella.»

## Verificación
- `npx tsc --noEmit`, `npm run lint`, `npm run verify:company-profile`, `npm run verify:bot-history`, `npm run verify:bot-openai` y `npm run verify:whatsapp-chat` (el motor cambió).
- Medición de la transcripción con un audio de 5 min.
- Sin navegador (modo chat, sin autorización): grabar audio, arrastrar archivos, la barra desplegable en celular y la conversación real con la IA quedan como pendientes de prueba visual.
