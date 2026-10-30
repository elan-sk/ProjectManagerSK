# Plan 014 — API oficial de Meta, QR de respaldo, tope, pedidos por grupo y reenvíos

Spec: [spec.md](spec.md) · Diagrama: [change-diagram.png](change-diagram.png)

## Inventario de impacto

| Consumidor | Estado |
|---|---|
| `sendRawMessage` / `sendDirectAlert` (avisos privados, cola, resumen diario, reporte al admin, recuperar contraseña, prueba, bot) | ✅ se ajusta: elige conexión, ventana 24 h o plantilla, tope (RF-8, 9, 11, 12, 19, 21) |
| `sendGroupAlert` (resumen de alertas al grupo, recordatorio de reunión, bot `send_whatsapp_group_message`) | ✅ con API: por privado a los mencionados; sin mencionados → falla con motivo (RF-10) |
| `sendWelcomeMessage` (bot) | ✅ con API: solo si la ventana está abierta; si no, se avisa que la bienvenida sale cuando la persona escriba (casos límite) |
| `sendChatReply` / `sendConfirmPoll` (chat) | ✅ transporte por conexión; botones con API (RF-13, 15); cuentan para el tope (RF-19) |
| Chat entrante `whatsappChat.ts` | ✅ núcleo común para QR y API, reenvíos (RF-13, 35-37), menciones en grupo (RF-25-33) |
| `scheduler.ts` (cola, recordatorios, resúmenes) | ✅ sin cambio de lógica; el tope corta en el envío (RF-21) |
| `notifications.ts` resumen diario | ✅ el motivo de falla dice «se alcanzó el tope mensual» cuando corresponde (RF-21) |
| `instrumentation.ts` + `ensureWhatsAppAlive` | ✅ el QR solo arranca si la conexión es QR o «Atender menciones en grupos» está activa (RF-3) |
| Alarma del encabezado (`/api/whatsapp/health`, `WhatsAppHealthAlert`) | ✅ estado de la API oficial y, si aplica, del QR (RF-3) |
| Configuración → WhatsApp (`WhatsAppConnectPanel`, `whatsappActions`) | ✅ selector, datos de la API, contador y tope (RF-1, 2, 5-7, 20, 23) |
| Configuración → Bot (`BotSettingsForm`) | ✅ casilla «Atender menciones en grupos» (RF-24) |
| Selector de grupo del proyecto (Definición) y `PATCH /api/v1/projects/:id` | ➖ no aplica: siguen listando los grupos del QR; con el QR apagado la lista sale vacía, como hoy cuando está desconectado |
| Bot `send_to_other_channel`, `send_daily_digest` | ✅ pasan por `sendDirectAlert` (ajustado arriba) |
| `userDeletion.ts` (vaciar cuenta) | ✅ también limpia la fecha del último mensaje al bot |
| `/api/v1/logs` | ➖ no aplica: solo lee registros; los nuevos no llevan token ni texto |
| Avisos de novedad (`featureHints.ts`) | ✅ dos avisos nuevos: conexión con la API oficial y menciones en grupos |
| Notificaciones en la app | ✅ aviso a administradores al 80 % y 100 % (RF-22) con `notify` tipo SYSTEM |
| Tope de preguntas del bot | ✅ los pedidos del grupo lo consumen (RF-25), por la misma entrada del chat |
| Respaldos/exportaciones | ➖ no aplica: no exportan configuración de WhatsApp |

## Archivos

| Archivo | Responsabilidad | RF |
|---|---|---|
| `prisma/schema.prisma` + migración SQL | `AppSetting`: `whatsappConnection` («qr»/«cloud»), `cloudPhoneNumberId`, `cloudAccessToken` (cifrado), `cloudAppSecret` (cifrado), `cloudVerifyToken`, `cloudTemplateName`, `cloudTemplateLang`, `cloudLastError`, `whatsappMonthlyLimit` (1500), `whatsappSentThisPeriod`, `whatsappPeriodStart`, `whatsappLimitWarnedPct`, `botGroupMentionsEnabled`. `User.whatsappLastInboundAt` | 1-7, 18-24 |
| `src/lib/whatsappCloud.ts` (nuevo) | Cliente de la API: texto, plantilla, botones, imagen/documento (subida de media), «escribiendo», descarga de media, verificación del número | 5-9, 13-15 |
| `src/lib/whatsappCloudFormat.ts` (nuevo, sin base ni red) | Resumen de una línea, link del aviso, firma del webhook, armado del contexto del grupo, juntar reenvíos, período del contador | 9, 16, 19, 27, 36 |
| `src/lib/whatsappUsage.ts` (nuevo) | Contar mensajes, saber si se llegó al tope, aviso 80/100 % | 19-23 |
| `src/lib/whatsapp.ts` | Funciones públicas eligen conexión; pausas solo QR; tope; QR arranca según RF-3; registro de mensajes de grupo y menciones | 1-4, 8-12, 19, 21, 24-34 |
| `src/lib/whatsappChat.ts` | Núcleo del chat independiente de la conexión (transporte QR o API), reenvíos juntos, pedidos de grupo abiertos por persona | 13-15, 17, 18, 25-37 |
| `src/app/api/whatsapp/cloud/route.ts` (nuevo) | Webhook: GET verificación, POST con firma, sin duplicados | 13, 16, 17 |
| `src/lib/chontatecTools.ts` + `chontatec.ts` | Herramienta `post_group_result` (publica el resultado en el grupo citando la mención); regla del chat para pedidos de grupo y reenvíos | 29-31, 35, 37 |
| `src/lib/appSettings.ts` / `botSettings.ts` | Lectura y guardado de la configuración nueva (cifrado con `credentialCrypto`) | 2, 5, 6, 24 |
| `src/app/(app)/settings/*` | Selector, formulario de la API, contador y tope; casilla en Bot | 1, 5-7, 20, 24 |
| `src/app/api/whatsapp/health/route.ts`, `WhatsAppHealthAlert.tsx` | Estado según conexión | 3 |
| `src/instrumentation.ts`, `src/lib/userDeletion.ts`, `src/lib/featureHints.ts`, `src/lib/notifications.ts` | Arranque, borrado, avisos de novedad, motivo de falla | 3, 21 |
| `scripts/verify-whatsapp-cloud.ts` + `npm run verify:whatsapp-cloud` | Chequeo ejecutable | todos los de lógica |

## Qué se reutiliza

- Contador mensual con reinicio «perezoso» del tope de preguntas del bot (`checkAndConsumeBotQuestion`): mismo patrón para mensajes.
- Cifrado de contraseñas (`credentialCrypto`) para el token y la clave secreta.
- Todo el chat actual (`dispatch`, `deliver`, entrada interna, transcripción, guardado de archivos, `toWhatsAppText`, `splitWhatsApp`, `parseConfirmation`): se separa solo el envío para que lo use cualquiera de las dos conexiones.
- `notify` (SYSTEM) para el aviso a administradores; `blockedByTestMode` para el modo prueba.
- Desde cero: el cliente de la API de Meta y el webhook (no hay nada parecido en el repo).

## Lógica principal

```
enviarAviso(persona, texto, urgente):
  si tope alcanzado y no urgente → false (motivo «tope mensual»)
  si conexión = cloud:
     si persona escribió hace < 24 h → texto completo
     si no → plantilla(nombre, resumenUnaLinea(texto), link(texto))
  si conexión = qr → con pausa (como hoy)
  si salió → contar (+ aviso 80/100 %)

alertaGrupo(grupo, texto, mencionados):
  cloud → enviarAviso a cada mencionado; sin mencionados → false
  qr → como hoy

mensaje entrante (QR o webhook) → núcleo:
  privado: guardar «último mensaje»; si es reenvío o llega < 5 s de uno → juntar 5 s → un pedido «[Reenviado]…»
  grupo (solo QR, casilla activa, grupo configurado):
     guardar texto en memoria (20 / 3 h)
     si menciona al bot y la persona está registrada:
        abrir pedido de grupo (grupo, mensaje de la mención, proyecto)
        pedido = citado + recientes + texto → chat de la persona (respuestas por privado vía QR)
  bot termina → post_group_result(texto) → responde en el grupo citando la mención → cierra el pedido
```

## Decisiones técnicas

- **Un núcleo de chat con dos transportes**, no dos copias del chat: así reenvíos, grupo y confirmaciones funcionan igual. Alternativa descartada: un archivo de chat por conexión (duplica lógica y se desincroniza).
- **El bot avisa que terminó con una herramienta** (`post_group_result`), no detectando el fin por texto: la IA sabe cuándo terminó o falló. Alternativa descartada: publicar cada respuesta final en el grupo (mandaría preguntas intermedias al grupo).
- **Mensajes del grupo solo en memoria** (RF-33): sin tabla nueva; se pierden al reiniciar (aceptado en la spec).
- **Versión de la API de Meta fija** (`v24.0`) en una constante.
- **Tope cuenta en el envío**, no en cada caller: un solo lugar para las dos conexiones.

## Migración

SQL generado con `prisma migrate diff` y aplicado con `migrate deploy` (en local `migrate dev` no funciona). Solo columnas nuevas con valor por defecto: no toca datos existentes. En producción corre dentro de `npm run build`.

## Verificación

- `npx tsc --noEmit`, `npm run lint`.
- `npm run verify:whatsapp-chat` (lo existente sigue igual).
- `npm run verify:whatsapp-cloud` (nuevo): resumen de una línea sin saltos, link del aviso, firma válida/inválida del webhook, período y tope del contador (80/100 % una vez por mes), juntar reenvíos (< 5 s), contexto del grupo (20 / 3 h, citado con autor), sin duplicados.
- Sin probar en vivo: envío real por Meta (hace falta la cuenta) y menciones en un grupo real (regla: nunca mensajes de prueba a grupos reales). Se dice al cerrar.
