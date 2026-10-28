# Especificación 013 — Chat del bot por WhatsApp

Estado: aprobada

| | |
|---|---|
| Origen | Pedido por chat, 2026-10-28 |

## Pedido original

> «Ya tengo un número y WA real, ahora crea el protocolo para que el chat se pueda comunicar por el WA, debe poder hacer lo mismo que se hace desde el chat, adjuntar documento etc. La credencial se obtiene con el número, es decir se compara el número desde donde se escribe con el que está en el sistema y dependiendo de eso se le permite hacer o no dependiendo de su usuario, también se debe poder autorizar como así como se hace en el chat.»

Acordado en la entrevista: ver «Decisiones tomadas en la entrevista».

## Fuentes
- Conversación del 2026-10-28 (este chat): pedido y respuestas de la entrevista.
- Código actual: chat del bot (Chontatec) con historial, herramientas por rol y confirmación de acciones; WhatsApp por Baileys v7 solo para enviar avisos.
- Biblioteca de Depura: no consultada (proyecto propio, sin componentes de la biblioteca en este stack).

## Contexto y objetivo
Hoy el bot de WhatsApp solo envía avisos, y el chat de IA solo existe dentro de la app. El objetivo es que cualquier usuario activo pueda escribirle al número del bot por WhatsApp y hacer lo mismo que hace en el chat de la app: consultar, crear, editar, adjuntar y crear archivos, con sus permisos y confirmando las acciones igual que en la web.

Se nota que funcionó cuando un usuario escribe por WhatsApp «¿qué tareas tengo atrasadas?» y recibe la misma respuesta que en el chat de la app, y cuando pide crear una tarea, responde «sí» y la tarea aparece en la app.

## Usuarios
- **Usuario activo con teléfono cargado** (miembro, PM o administrador): usa el chat por WhatsApp con exactamente los permisos que tiene en la app.
- **Administrador**: enciende o apaga las respuestas por WhatsApp desde Configuración → Bot.
- **Número desconocido o usuario inactivo**: no recibe respuesta.

## Historias de usuario
- HU-1. Como usuario, quiero preguntarle al bot por WhatsApp por mis proyectos y tareas para no tener que abrir la app.
- HU-2. Como usuario, quiero pedirle al bot por WhatsApp que cree o cambie algo y confirmarlo con «sí» o «no», igual que con el botón del chat.
- HU-3. Como usuario, quiero mandarle al bot una imagen o un documento por WhatsApp para que lo lea o lo adjunte a una tarea.
- HU-4. Como usuario, quiero recibir por WhatsApp los archivos que crea el bot, listos para abrir o reenviar.
- HU-5. Como administrador, quiero un interruptor para apagar las respuestas por WhatsApp al instante.
- HU-6. Como usuario, quiero dictarle al bot una nota de voz para pedir algo sin escribir.
- HU-7. Como usuario, quiero seguir por WhatsApp algo que empecé en el chat de la app (y al revés) sin repetir el contexto.

## Definiciones
- **Chat directo**: conversación uno a uno con el número del bot (no un grupo).
- **Canal**: por dónde conversa la persona con el bot: el chat de la app o WhatsApp.
- **Acción pendiente**: acción de escritura que el bot propuso y espera confirmación (lo mismo que hoy muestra el botón Confirmar/Cancelar en el chat de la app).

## Requisitos funcionales (EARS)

**Identidad y acceso**
- RF-1: CUANDO llega un mensaje por chat directo, EL SISTEMA identifica a la persona comparando el número de quien escribe con el teléfono de los usuarios de PMSK, también cuando WhatsApp entrega un identificador interno en vez del número.
- RF-2: SI el número no corresponde a un usuario activo, ENTONCES EL SISTEMA no responde nada y no guarda el mensaje.
- RF-3: EL SISTEMA ejecuta todo lo que pide la persona por WhatsApp con sus permisos y su rol, exactamente los mismos que en el chat de la app (mismas herramientas, mismos filtros de visibilidad, incluidos proyectos ocultos y contraseñas).
- RF-4: EL SISTEMA no responde mensajes de grupos, estados ni difusiones, ni los que envía el propio número del bot.
- RF-5: MIENTRAS el interruptor «Responder por WhatsApp» de Configuración → Bot esté apagado, EL SISTEMA ignora los mensajes entrantes. El interruptor viene apagado y solo lo cambia un administrador.

**Conversación**
- RF-6: CUANDO un usuario identificado escribe un texto, EL SISTEMA lo procesa con el mismo motor del chat de la app y responde por el mismo chat directo de WhatsApp.
- ~~RF-7: EL SISTEMA usa la misma conversación que el chat de la app: lo hablado por WhatsApp aparece en la burbuja de la app, y al revés.~~ (reemplazado por RF-29 a RF-31, 2026-10-28)
- RF-8: EL SISTEMA descuenta cada pregunta por WhatsApp del mismo tope mensual de preguntas del bot y la registra en el uso del bot, igual que en la app.
- RF-9: EL SISTEMA convierte la respuesta al formato de WhatsApp: negritas con *texto*, listas con «- », personas, proyectos y estados como texto con su nombre (sin la sintaxis interna de la app), y los links como dirección completa de la app, clickeable.
- RF-10: SI llegan varios mensajes seguidos de la misma persona, ENTONCES EL SISTEMA los responde en orden, uno a la vez.
- RF-11: SI el servicio de IA falla, tarda demasiado, llegó al tope o no está configurado, ENTONCES EL SISTEMA responde por WhatsApp el mismo aviso en lenguaje simple que mostraría el chat de la app. Ningún error deja a la persona sin respuesta ni afecta el envío de avisos.
- RF-12: EL SISTEMA responde de inmediato, también fuera del horario laboral: la regla de horario laboral es solo para los avisos automáticos.

**Confirmación de acciones**
- RF-13: CUANDO el bot propone una acción de escritura, EL SISTEMA manda por WhatsApp el resumen de lo que va a hacer (el mismo texto del botón de confirmación de la app) en un mensaje que termina con «Toque una opción de la encuesta o responda *sí* o *no*.», y enseguida una encuesta de WhatsApp «¿Confirma esta acción?» con dos opciones para tocar: «✅ Confirmar» y «❌ Cancelar».
- RF-14: SI la acción no se puede deshacer, ENTONCES el mensaje lo advierte con «⚠️ Esto no se puede deshacer.» antes de pedir la confirmación.
- RF-15: MIENTRAS haya una acción pendiente, CUANDO la persona toca una opción de la encuesta, EL SISTEMA confirma o cancela según la opción; también CUANDO responde por texto «sí» (o «si», «dale», «confirmar», «ok»), EL SISTEMA la ejecuta; CUANDO responde «no» (o «cancelar»), la cancela. Sin distinguir mayúsculas, tildes ni signos.
- RF-16: SI hay una acción pendiente y la persona escribe otra cosa, ENTONCES EL SISTEMA le recuerda que confirme o cancele primero, como hace el chat de la app.
- ~~RF-17: EL SISTEMA acepta confirmar o cancelar desde cualquiera de los dos canales.~~ (reemplazado por RF-33, 2026-10-28)

**Archivos**
- RF-18: CUANDO la persona manda una imagen o un documento (con o sin texto), EL SISTEMA lo guarda como si lo hubiera subido en el chat de la app y el bot lo lee de inmediato; adjuntarlo a una tarea o al proyecto sigue siendo una acción con confirmación.
- RF-19: SI el archivo es de un tipo no permitido o supera el tamaño máximo de la app, ENTONCES EL SISTEMA responde el mismo mensaje de error que da la app al subirlo, sin llamar a la IA.
- ~~RF-20: CUANDO la persona manda una nota de voz, un video, un sticker, una ubicación o un contacto, EL SISTEMA responde «Por ahora solo leo texto, imágenes y documentos.» sin llamar a la IA ni descontar preguntas.~~ (reemplazado por RF-22 y RF-26, 2026-10-28)
- RF-21: CUANDO la respuesta del bot incluye un archivo de la app (por ejemplo, uno creado con «crear archivo»), EL SISTEMA lo envía como documento adjunto de WhatsApp y deja también el link a la app en el texto.

**Notas de voz**
- RF-22: CUANDO la persona manda una nota de voz o un archivo de audio, EL SISTEMA lo transcribe a texto en el propio servidor, sin usar el servicio de IA ni gastar tokens, y a la IA le llega solo el texto transcrito, como si la persona lo hubiera escrito.
- RF-23: EL SISTEMA empieza la respuesta a una nota de voz con «🎤 Entendí: «<transcripción>»».
- RF-24: SI la nota de voz dura más de 5 minutos, ENTONCES EL SISTEMA responde «La nota de voz es muy larga; máximo 5 minutos.» sin transcribirla ni descontar preguntas.
- RF-25: SI la transcripción sale vacía o falla, ENTONCES EL SISTEMA responde «No se pudo entender la nota de voz; puede intentarlo de nuevo o escribirlo.» sin llamar a la IA ni descontar preguntas.
- RF-26: CUANDO la persona manda un video, un sticker, una ubicación o un contacto, EL SISTEMA responde «Por ahora solo leo texto, notas de voz, imágenes y documentos.» sin llamar a la IA ni descontar preguntas.
- RF-27: EL SISTEMA transcribe una nota de voz a la vez; las demás esperan su turno, para no saturar el servidor.
- RF-28: MIENTRAS una nota de voz es una respuesta a una acción pendiente, su transcripción vale igual que un texto: «sí» confirma y «no» cancela.

**Dos canales, historiales aparte**
- RF-29: EL SISTEMA guarda un historial aparte por canal: lo hablado por WhatsApp no aparece en la burbuja de la app, y lo de la app no se reenvía a WhatsApp.
- RF-30: EL SISTEMA le da a la IA, como contexto de solo lectura, los últimos 10 mensajes de texto de la persona y del bot en el otro canal, indicando de qué canal son, para que pueda continuar una conversación empezada en el otro medio. Esos mensajes no se copian al historial del canal actual.
- RF-31: EL SISTEMA responde siempre por el canal donde lo contactaron. SOLO CUANDO la persona lo pide de forma explícita («mandámelo al WhatsApp», «dejalo en el chat de la app»), EL SISTEMA envía ese contenido al otro canal de la misma persona, y a nadie más.
- RF-32: MIENTRAS el canal es WhatsApp, EL SISTEMA responde más corto que en la app: lo esencial primero, sin tablas, listas de hasta 5 ítems (con «y N más» y el link a la app para ver todo) y sin repetir lo que la persona ya dijo.
- RF-33: EL SISTEMA confirma o cancela una acción pendiente solo en el canal donde se propuso; una acción pendiente en un canal no bloquea al otro.
- RF-34: CUANDO la persona borra el historial desde la app, EL SISTEMA borra solo la conversación de la app; la de WhatsApp se conserva.

## Requisitos no funcionales
- No se duplica la lógica del chat: WhatsApp usa el mismo motor, herramientas y permisos que el chat de la app.
- La identidad sale solo del número que entrega WhatsApp, nunca de lo que diga el texto («soy Juan»).
- Teléfonos: no se muestran en registros completos (se enmascaran como hoy).
- Verificación con `npx tsc --noEmit`, `npm run lint` y un chequeo ejecutable `scripts/verify-whatsapp-chat.ts` (formato, confirmaciones, identificación por número).

## Casos límite
- Dos usuarios con el mismo teléfono cargado: no se responde y se deja registro para el administrador (identidad ambigua).
- Teléfono guardado con «+», espacios o guiones: se compara solo por dígitos.
- La persona escribe mientras WhatsApp se reconecta: el mensaje que entregue WhatsApp al reconectar se procesa; si WhatsApp no lo entrega, se pierde (no hay reintento propio).
- Mensajes viejos que WhatsApp entrega en bloque al reconectar (historial): no se responden; solo los recibidos en vivo.
- Respuesta muy larga: se envía en varios mensajes, sin cortar palabras.
- Documento con texto: el texto va como el mensaje de la persona; sin texto se usa «Subí este archivo.», como en la app.
- Usuario desactivado con una acción pendiente: deja de recibir respuesta y la acción no se ejecuta.
- En desarrollo, con el modo prueba de WhatsApp (solo un número permitido), solo ese número recibe respuestas.

## Fuera de alcance
- Transcribir audios en el chat de la app (solo WhatsApp en esta etapa).
- Responder en grupos.
- Botones interactivos de WhatsApp: no son confiables con Baileys (Meta no los muestra fuera de la API oficial). En su lugar, encuesta de dos opciones (RF-13).
- Vincular el número nuevo del bot: es un paso manual (escanear el QR en Configuración) y agregar ese número a los grupos de los proyectos.
- API oficial de Meta.

## Criterios de finalización
- Todos los RF verificados (chequeo ejecutable, lectura de código o prueba en vivo autorizada).
- `tsc`, `lint` y `verify-whatsapp-chat` en verde.
- El envío de avisos de WhatsApp (resumen diario, alertas, grupos) sigue funcionando igual.
- Aviso de novedad en `featureHints.ts` con texto aprobado en el chat.

## Decisiones tomadas en la entrevista
- ¿Responde en grupos? → Solo chats directos (no se mete en las conversaciones del equipo ni actúa con los permisos de alguien frente a todos).
- ¿Acciones irreversibles por WhatsApp? → Igual que el resto, con aviso «no se puede deshacer» y «sí»/«no».
- ¿Número desconocido? → No responde nada (no revela el bot y reduce el riesgo de spam).
- ~~¿Historial? → La misma conversación que el chat de la app.~~ → Cambiado al aprobar: historiales aparte por canal; la IA conoce los últimos mensajes del otro canal; responde por el canal de contacto salvo pedido explícito.
- ¿Botones para confirmar? → No viables con Baileys; se usa una encuesta de WhatsApp de dos opciones, y el «sí»/«no» por texto o audio sigue valiendo.
- ¿Largo de las respuestas? → Más cortas en WhatsApp.
- ~~¿Notas de voz? → Para otra etapa.~~ → Cambiado al aprobar: se transcriben en esta etapa, en el servidor y sin tokens.
- ¿Modelo de voz? → Whisper base (liviano y rápido; acepta más errores con nombres propios o ruido que small).
- ¿Mostrar lo que entendió? → Sí, «🎤 Entendí: …» al inicio de la respuesta, para detectar un nombre mal oído antes de confirmar.
- ¿Duración máxima? → 5 minutos.
- ¿Archivos del bot? → Como documento adjunto de WhatsApp más el link.
- ¿Interruptor? → Sí, en Configuración → Bot, empieza apagado.

## Cambios
- 2026-10-28 — Antes de aprobar: se agregan las notas de voz (RF-22 a RF-28) y se retira RF-20 (pedido del usuario: transcribir sin gastar tokens).
- 2026-10-28 — Antes de aprobar: historiales aparte por canal que se conocen entre sí (RF-29 a RF-31, RF-33, RF-34; se retiran RF-7 y RF-17), respuestas más cortas en WhatsApp (RF-32) y confirmación con encuesta (RF-13, RF-15).
- 2026-10-28 — Al planear: texto de RF-25 pasado a tercera persona (regla de textos de la app), sin cambio de fondo.
- 2026-10-28 — Al implementar: RF-13 manda el resumen como mensaje y la encuesta enseguida (la pregunta de una encuesta tiene largo limitado); mismo comportamiento para la persona.

## Dudas abiertas
(ninguna)
