# Especificación 014 — Conexión de WhatsApp por la API oficial de wMeta, con el QR de respaldo, y pedidos al bot desde el grupo

Estado: implementada
|
| | |
|---|---|
| Origen | Pedido por chat, 2026-10-29 |

## Pedido original

> «Crea una segunda forma de conectar sin perder la que ya usamos para tenerla de respaldo; cuando termine me indicás qué debo hacer en Facebook para activar esa API. También crea un límite como en la versión de chat para no pasarse de ciertos mensajes; dejá el predeterminado con un límite razonable según el uso que le damos. Revisá en producción cuántos mensajes llevamos. Ese límite se puede aumentar en algún caso dado.»

Adición (misma fecha, antes de aprobar): «Que el bot, al mencionarlo con @ en el grupo, tome ese mensaje para aplicar la tarea; si necesita algún dato adicional le escribe por interno a la persona que lo mencionó y, cuando termine la petición, manda el resultado con su link al grupo. También debe interpretar las referencias: si mi jefe David pidió algo y yo respondo ese mensaje mencionando al bot, debe entender que me refiero a ese mensaje. Y si hay mensajes que complementan, es decir un mensaje partido en varias partes, debe poder detectarlo y complementar la información» — aclarado: no esperando a que la persona termine, sino revisando mensajes anteriores del grupo para ver si hay algo relacionado.

Adición (2026-10-30, antes de aprobar): «Si yo te reenvío un mensaje, lo debes tomar también como petición de tarea.»

Contexto: el número conectado por QR fue bloqueado por Meta («Cuenta en revisión») apenas se conectó. La conexión por QR (no oficial) va contra las condiciones de WhatsApp; la API oficial (Cloud API) es la vía permitida y cuesta menos de US$ 1 al mes con el uso actual (estudio del 2026-10-29).

## Fuentes

- Conversación del 2026-10-29 (estudio de costos y viabilidad, captura del bloqueo).
- Código actual: conexión por QR, chat por WhatsApp (Especificación 013), límite mensual de preguntas del bot.
- Documentación de Meta: precios por mensaje (Colombia: utilidad US$ 0,0008; servicio gratis hasta 1.000 al mes), ventana de 24 h, plantillas, indicador «escribiendo», verificación del webhook y su firma, API de grupos (exige «Cuenta comercial oficial»).
- Base local (copia de producción del 2026-10-11): 9 personas con teléfono, 1 grupo, ~267 alertas de grupo y 52 avisos en cola en octubre. Producción: pendiente (ver Dudas abiertas).

## Contexto y objetivo

Que la app pueda mandar y recibir WhatsApp por la API oficial de Meta, sin riesgo de bloqueo, y conservar la conexión por QR como respaldo que se elige a mano. Además, un tope mensual de mensajes para controlar el gasto y frenar envíos desbocados.

## Usuarios

- **Administradores**: configuran la conexión, eligen cuál se usa, ven el contador y cambian el tope (Configuración → WhatsApp).
- **Equipo**: recibe los avisos y conversa con el bot como hoy; no configura nada.

## Historias de usuario

- HU-1. Como administrador, quiero conectar la app a la API oficial de Meta para que el número no se bloquee.
- HU-2. Como administrador, quiero conservar la conexión por QR y volver a ella con un selector, por si la API oficial falla.
- HU-3. Como persona del equipo, quiero seguir recibiendo mis avisos y conversar con el bot igual que hoy, sin importar la conexión.
- HU-5. Como persona del equipo, quiero pedirle algo al bot mencionándolo en el grupo del proyecto, y que entienda a qué mensaje respondo y lo que se dijo antes, para no tener que repetirlo.
- HU-6. Como persona del equipo, quiero reenviarle al bot un mensaje (por ejemplo, un pedido de un cliente o de mi jefe) para que lo tome como un pedido y lo haga.
- HU-4. Como administrador, quiero un tope mensual de mensajes con un contador visible, que pueda subir cuando haga falta.

## Definiciones

- **Conexión por QR**: la de hoy (se escanea un código QR desde el teléfono).
- **API oficial**: WhatsApp Cloud API de Meta.
- **Ventana de 24 h**: plazo que abre Meta cuando la persona le escribe al bot; mientras está abierta se puede mandar texto libre.
- **Plantilla de aviso**: mensaje de texto fijo aprobado por Meta, con partes variables de una sola línea, para escribirle a alguien fuera de la ventana.

## Requisitos funcionales (EARS)

**Elegir la conexión**
- RF-1: EL SISTEMA muestra en Configuración → WhatsApp un selector «Conexión» con dos opciones, «Código QR» y «API oficial de Meta», y envía y recibe solo por la elegida. Por defecto queda «Código QR» (como hoy).
- RF-2: EL SISTEMA guarda los datos de las dos conexiones a la vez; cambiar el selector no borra los datos de la otra.
- RF-3: MIENTRAS la conexión elegida es la API oficial, EL SISTEMA no abre la conexión por QR (ni al arrancar ni con el vigilante de reconexión), salvo que esté activa «Atender menciones en grupos» (RF-24); la alarma de conexión del encabezado refleja el estado de la API oficial y, con esa casilla activa, también el del QR.
- RF-4: CUANDO un administrador vuelve a «Código QR», EL SISTEMA retoma la conexión por QR como hoy (sesión guardada o QR nuevo).

**Configurar la API oficial**
- RF-5: EL SISTEMA permite a un administrador cargar: identificador del número de teléfono, token de acceso, clave secreta de la app, nombre e idioma de la plantilla de aviso. Muestra la dirección del webhook y el token de verificación que se copian en Meta.
- RF-6: EL SISTEMA guarda el token de acceso y la clave secreta cifrados y nunca los vuelve a mostrar completos (solo los últimos 4 caracteres), igual que la clave del bot.
- RF-7: CUANDO un administrador guarda los datos, EL SISTEMA comprueba con Meta que el número y el token son válidos y muestra «Conectado» con el número, o el motivo del error en lenguaje simple.

**Enviar por la API oficial**
- RF-8: CUANDO la app manda un aviso a una persona que escribió al bot en las últimas 24 h, EL SISTEMA lo envía con el mismo texto completo de siempre.
- RF-9: CUANDO la app manda un aviso a una persona fuera de la ventana de 24 h, EL SISTEMA usa la plantilla de aviso con el nombre de la persona, un resumen de una línea del aviso y el link a la pantalla que corresponda.
- RF-10: MIENTRAS la conexión es la API oficial, CUANDO la app manda una alerta al grupo de un proyecto (resumen de alertas, recordatorio de reunión, mensaje al grupo pedido al bot), EL SISTEMA la envía por privado a cada persona mencionada en ella. Si no menciona a nadie, el bot responde que con la API oficial no se puede escribir en grupos.
- RF-11: MIENTRAS la conexión es la API oficial, EL SISTEMA no aplica las pausas de 20 a 40 s entre mensajes; con el QR siguen como están.
- RF-12: SI Meta rechaza un envío, ENTONCES EL SISTEMA lo trata como un envío fallido de hoy (pasa a la cola o al reporte del resumen) y deja el motivo en el registro del servidor.

**Recibir por la API oficial (chat)**
- RF-13: MIENTRAS la conexión es la API oficial y el chat por WhatsApp está activo, CUANDO una persona del equipo le escribe al bot, EL SISTEMA responde igual que con el QR: texto, notas de voz, imágenes y documentos, mismos permisos, mismo historial.
- RF-14: MIENTRAS el bot prepara la respuesta, EL SISTEMA muestra «escribiendo…» en el chat de la persona.
- RF-15: CUANDO el bot necesita confirmar una acción, EL SISTEMA manda dos botones «✅ Confirmar» y «❌ Cancelar» (en vez de la encuesta del QR); también vale responder «sí» o «no».
- RF-16: SI un mensaje entrante no trae la firma válida de Meta, ENTONCES EL SISTEMA lo descarta sin procesarlo.
- RF-17: SI Meta entrega dos veces el mismo mensaje, ENTONCES EL SISTEMA lo procesa una sola vez.
- RF-18: EL SISTEMA registra la fecha del último mensaje de cada persona al bot (para saber si la ventana de 24 h está abierta), con las dos conexiones.

**Pedidos al bot desde el grupo (solo por el número del QR)**
- RF-24: EL SISTEMA muestra en Configuración → Bot la casilla «Atender menciones en grupos», apagada por defecto. Con ella activa, el número del QR queda conectado aunque la conexión elegida sea la API oficial, y solo se usa para el grupo y para las preguntas por privado de estos pedidos.
- RF-25: MIENTRAS la casilla está activa, CUANDO una persona registrada menciona al bot («@Chontatec …») en un grupo configurado en la app (el grupo por defecto o el de un proyecto), EL SISTEMA toma el pedido con los permisos de esa persona, como si se lo escribiera por privado, y lo cuenta en el tope mensual de preguntas del bot.
- RF-26: CUANDO el mensaje con la mención responde (cita) a otro mensaje del grupo, EL SISTEMA le pasa al bot el mensaje citado con el nombre de quien lo escribió, y el bot entiende que el pedido se refiere a él (ej.: David pidió algo, Elan lo responde con «@Chontatec hacelo»).
- RF-27: CUANDO el bot recibe un pedido del grupo, EL SISTEMA le pasa también los mensajes de texto recientes del grupo (hasta los últimos 20, de las últimas 3 horas, con autor y hora) para que detecte los que están relacionados: un pedido partido en varios mensajes o lo que se habló antes. El bot usa solo lo relacionado con el pedido.
- RF-28: CUANDO el grupo está asociado a un proyecto, EL SISTEMA le indica al bot ese proyecto como el del pedido, salvo que el pedido nombre otro.
- RF-29: SI al bot le falta un dato o necesita confirmar una acción, ENTONCES EL SISTEMA se lo pregunta por privado a quien lo mencionó, por el número del QR, y la conversación sigue ahí; en el grupo no se escribe nada hasta terminar.
- RF-30: CUANDO el bot termina el pedido, EL SISTEMA publica en el grupo, como respuesta al mensaje de la mención, el resultado con el link de lo que se creó o cambió.
- RF-31: SI el bot no pudo hacer el pedido (sin permiso, error, la persona canceló), ENTONCES EL SISTEMA lo publica en el grupo en una línea, sin detalles internos.
- RF-32: SI quien menciona al bot no está registrado o no tiene su número en el perfil, ENTONCES EL SISTEMA no responde y lo deja anotado en el registro del servidor.
- RF-33: EL SISTEMA guarda los mensajes recientes del grupo solo en memoria, para el contexto de RF-27; no los guarda en la base. Al pedido y su conversación los guarda en el historial del chat de la persona, como el resto de su chat por WhatsApp.
- RF-34: MIENTRAS el número del QR está conectado, CUANDO alguien le escribe por privado a ese número, EL SISTEMA le responde por ese mismo número (con la API oficial elegida, el chat principal sigue siendo el número de la API).

**Mensajes reenviados al bot (por privado, con las dos conexiones)**
- RF-35: CUANDO una persona le reenvía al bot por privado un mensaje (texto, nota de voz, imagen o documento), EL SISTEMA se lo pasa al bot marcado como reenviado, y el bot lo toma como un pedido a hacer con los permisos de esa persona (con las confirmaciones de siempre para crear o cambiar algo).
- RF-36: CUANDO llegan seguidos varios mensajes reenviados, o un reenvío y un comentario de la persona (sin más de 5 s entre uno y otro), EL SISTEMA los junta en un solo pedido y el bot responde una sola vez.
- RF-37: EL SISTEMA no le atribuye el mensaje reenviado a nadie: WhatsApp no informa quién lo escribió originalmente; si el autor importa para el pedido, el bot lo pregunta.

**Tope mensual de mensajes**
- RF-19: EL SISTEMA cuenta cada mensaje de WhatsApp que sale de la app, por cualquiera de las dos conexiones, en un contador mensual que vuelve a cero el día 1.
- RF-20: EL SISTEMA muestra en Configuración → WhatsApp «Enviados este mes: N / tope» y un campo para cambiar el tope; por defecto, 1.500 al mes.
- RF-21: MIENTRAS el contador llegó al tope, EL SISTEMA no envía los avisos automáticos (resúmenes, alertas, recordatorios, cola); se tratan como envíos fallidos y siguen visibles en las notificaciones de la app. Siguen saliendo el link de recuperar contraseña, «Enviar prueba» y las respuestas del chat.
- RF-22: CUANDO el contador llega al 80 % y al 100 % del tope, EL SISTEMA avisa una vez por mes a los administradores con una notificación en la app.
- RF-23: CUANDO un administrador sube el tope por encima de lo enviado, EL SISTEMA vuelve a enviar los avisos automáticos desde ese momento.

## Requisitos no funcionales

- Solo administradores ven y cambian la configuración y el tope.
- El token, la clave secreta y el texto de los mensajes nunca van al registro del servidor.
- El modo prueba (`WHATSAPP_ONLY_PHONE`, solo desarrollo) aplica también a la API oficial.
- Textos de la app en tercera persona, sin jerga; errores de Meta traducidos a lenguaje simple.

## Casos límite

- Datos de la API oficial incompletos o token vencido con el selector en «API oficial»: no sale nada, la alarma del encabezado lo avisa y Configuración muestra el motivo.
- Plantilla no aprobada todavía: los avisos fuera de la ventana fallan (RF-12) y el motivo de Meta queda visible en Configuración.
- Persona sin teléfono: igual que hoy.
- Mensaje dividido en varias partes: cada parte cuenta como un mensaje para el tope.
- Cambiar de conexión con avisos en cola: la cola sale por la conexión nueva.
- Mención sin texto de pedido («@Chontatec» solo) respondiendo a un mensaje: el pedido es el mensaje citado.
- Dos personas mencionan al bot casi a la vez: cada pedido se atiende por separado, en orden.
- Mención en un grupo que no está configurado en la app: se ignora.
- Se reinicia el servidor: se pierde el contexto reciente del grupo (RF-33); el pedido se atiende con lo que haya.
- Notas de voz e imágenes en el grupo: el contexto reciente toma solo texto; la mención debe ser por texto.
- Reenvío sin comentario: el pedido es el contenido reenviado; si no queda claro qué hacer, el bot pregunta.
- Reenvío de algo que no es un pedido (un saludo, un chiste): el bot responde que no encontró un pedido y pregunta qué hacer.
- Primer mensaje a una persona: la presentación del bot sale cuando la persona escriba por primera vez (con la API oficial no se puede mandar sin plantilla).

## Fuera de alcance

- Grupos por la API oficial (exige «Cuenta comercial oficial»).
- Cambio automático entre conexiones si una falla.
- Una plantilla por tipo de aviso.
- Registro detallado de cada mensaje enviado (solo el contador).
- Menciones en grupos por la API oficial (Meta no lee grupos normales).
- Contexto de notas de voz o imágenes anteriores del grupo.
- Llevar la foto del bot por la API oficial (se pone en el perfil del número en Meta).

## Criterios de finalización

- Todos los RF verificados (chequeo ejecutable, tsc, lint).
- La conexión por QR sigue funcionando igual con el selector en «Código QR».
- Guía paso a paso de lo que hay que hacer en Meta para activar la API, entregada al terminar.

## Decisiones tomadas en la entrevista

- Grupo con la API oficial elegida → el QR queda conectado solo para el grupo (y sus preguntas por privado).
- Preguntas por privado de un pedido del grupo → por el número del QR, sin plantilla.
- Mensajes relacionados → revisar los mensajes anteriores del grupo, no esperar a que la persona termine de escribir. Cantidad (20 mensajes, 3 horas) definida por el agente.
- Quien no está registrado → no se responde.
- Casilla «Atender menciones en grupos» apagada por defecto y solo grupos configurados en la app (decisión del agente: el QR queda conectado solo si se pide, y un grupo ajeno no usa el bot).

- Cómo se elige la conexión → selector manual (el QR no se usa mientras no haga falta, sin riesgo de bloqueo).
- Alertas al grupo con la API oficial → por privado a cada persona mencionada.
- Avisos fuera de la ventana de 24 h → una sola plantilla general; dentro de la ventana, texto completo.
- Al llegar al tope → se pausan los avisos automáticos; siguen la recuperación de contraseña, la prueba y el chat; aviso a administradores al 80 % y 100 %.
- Tope por defecto → 1.500 al mes (unas 2 veces el uso estimado de 550–750).
- Qué cuenta el tope → las dos conexiones.
- Pausas entre mensajes → solo para el QR; se suben junto con este cambio.
- Producción → autorizada la consulta de solo lectura.
- Mensaje al grupo pedido al bot sin personas mencionadas → el bot avisa que no se puede (decisión propia, por no tener a quién mandarlo).

## Dudas abiertas

Ninguna. Pendiente que no cambia la spec: el conteo real en producción (la clave SSH del servidor pide su frase de acceso). Si el dato muestra un uso muy distinto del estimado, se propone otro tope por defecto.
