# Especificación 015 — Asistente y perfil de la empresa

Estado: implementada

| | |
|---|---|
| Origen | Pedido por chat, 2026-11-05 (entrega 1 de 3 del «consultor de la empresa») |

## Pedido original

> «Quiero que conozcas la empresa… en configuraciones o en alguna parte debe haber un espacio para que tengas la información de la empresa: su nombre, su historia, su propósito, el sector… No quiero que sea algo rígido, solo campos. Quiero que te crees un asistente para que vayas preguntando, interactuando… la persona te puede responder con voz (Whisper, ya existe en el proyecto), con imágenes, con archivos… Le puedes preguntar por clientes, portafolio, proyección para crecer, qué quiere saber con la aplicación… qué quiere revisar con el equipo, qué consejos quiere… Una interfaz más amigable que el chat, paso a paso, pregunta por pregunta, haciéndole feedback… pantalla completa, voz, subir archivos, arrastrar y soltar.»

Entregas acordadas: **1) esta**: asistente y perfil de la empresa. 2) Asistente de proyectos (si no hay perfil, primero lo pide) y botón «Abrir asistente» en el chat. 3) «Aprendizajes»: conclusiones de consultor por proyecto, con una retrospectiva de los archivados.

## Fuentes
- Conversación del 2026-11-05 (decisiones en «Decisiones tomadas en la entrevista»).
- Código actual: el chat (botón flotante) ya tiene pantalla completa, arrastrar y soltar, subir archivos y dictado del navegador; las notas de voz de WhatsApp se transcriben con el Whisper del servidor sin gastar saldo de IA.

## Contexto y objetivo
La IA del sistema va a dar consejos y conclusiones sobre la empresa. Para que no sean genéricos necesita conocer la empresa y, sobre todo, **qué quiere lograr con la aplicación** (medir duración de proyectos, mejorar procesos, conseguir clientes, ver el rendimiento del equipo…). Esta entrega crea ese perfil a través de una conversación guiada, no de un formulario.

Se nota que funcionó cuando un administrador completa el perfil conversando (escribiendo, hablando o subiendo archivos) y el chat normal responde preguntas sobre la empresa con esa información, respetando quién puede ver qué.

## Usuarios
- **Administrador**: único que abre el asistente, ve el perfil completo, lo edita y gestiona sus documentos.
- **PM y miembros**: no ven la sección «Empresa» ni el asistente. Desde el chat normal pueden preguntar solo por la parte institucional.

## Historias de usuario
- HU-1. Como administrador, quiero que un asistente me pregunte por mi empresa paso a paso, para cargarla sin llenar un formulario.
- HU-2. Como administrador, quiero responder escribiendo, hablando o subiendo archivos, para usar lo que tenga a mano (un brochure, un audio).
- HU-3. Como administrador, quiero ver y corregir el perfil, a mano o volviendo a correr el asistente, para mantenerlo al día.
- HU-4. Como miembro del equipo, quiero preguntarle al chat a qué se dedica la empresa, sin acceder a su información delicada.

## Definiciones
- **Temas del perfil** (en este orden): Sector · Qué hace · Historia · Propósito · Cómo trabaja · Clientes · Portafolio · Crecimiento · Qué quiere revisar con la aplicación · Consejos que espera (10 temas).
- **Cómo trabaja**: los procesos de la empresa (etapas de un trabajo, quién revisa, cómo se entrega al cliente, cómo se manejan los cambios) y su **equivalencia de tipos de tarea**: qué significa en esta empresa cada tipo de la app (Simple, Entregable, Prueba, Ajuste, Aceptación) o «No se usa».
- **Institucional (público)**: Sector, Qué hace, Historia, Propósito, Cómo trabaja (incluida la equivalencia de tipos), Portafolio.
- **Delicado (solo administradores)**: Clientes, Crecimiento, Qué quiere revisar con la aplicación, Consejos que espera, los documentos de la empresa y todo consejo o conclusión sobre la empresa.
- **Nombre de la empresa**: va al inicio del perfil, aparte de los temas; es institucional.

## Requisitos funcionales (EARS)

**Sección «Empresa» en Configuración**
- RF-1: EL SISTEMA muestra en Configuración una sección «Empresa» solo a los administradores.
- RF-2: MIENTRAS el perfil esté vacío, la sección muestra un botón «Empezar con el asistente».
- RF-3: MIENTRAS el perfil tenga información, la sección lo muestra como documento: el nombre de la empresa y un título por tema con su texto, más los temas sin información marcados como pendientes. En «Cómo trabaja», la equivalencia de tipos se muestra como una lista «tipo: significado en esta empresa». Debajo de los temas aparece la lista «Documentos de la empresa».
- RF-4: CUANDO el administrador pulsa «Editar» en un tema (o en el nombre), EL SISTEMA permite corregir ese texto a mano y guardarlo («Guardar» al final, como acción principal).
- RF-5: EL SISTEMA ofrece «Seguir con el asistente» (si hay temas pendientes) o «Repasar con el asistente» (si todos están cubiertos), y ambos abren el asistente.
- RF-6: CUANDO el administrador quita un documento de la lista, EL SISTEMA pide confirmación con el diálogo propio de la app y lo quita del perfil.

**Asistente**
- RF-7: CUANDO se abre el asistente, EL SISTEMA lo muestra a pantalla completa, con la conversación, la lista de temas y su avance («N de 10»).
- RF-8: EL SISTEMA marca cada tema como pendiente, en curso o cubierto, y el avance cuenta los cubiertos.
- RF-9: CUANDO el asistente arranca con el perfil vacío, saluda en una frase, pregunta el nombre de la empresa y sigue con los temas en orden, una pregunta por vez.
- RF-10: CUANDO el administrador responde, EL SISTEMA comenta en una frase lo que entendió (feedback) antes de hacer la siguiente pregunta, y puede repreguntar si la respuesta quedó corta o ambigua.
- RF-11: CUANDO un tema queda cubierto, EL SISTEMA guarda su texto en el perfil, lo marca cubierto en la lista y deja en la conversación un aviso corto «Guardado en «<tema>»». No pide confirmación, porque el texto se puede corregir después (RF-4, RF-13).
- RF-12: CUANDO el administrador pide saltar un tema («después», «no sé», «saltar»), EL SISTEMA lo deja pendiente y pasa al siguiente.
- RF-13: CUANDO se repasa un perfil con información, EL SISTEMA muestra en cada tema lo que ya está guardado y pregunta si se agrega, se cambia o se deja así. Si el administrador pide un cambio, EL SISTEMA reescribe ese tema y lo guarda.
- RF-14: EL SISTEMA guarda la conversación del asistente aparte del chat normal. Se puede cerrar y retomar donde quedó, y la opción «Empezar de nuevo» borra la conversación sin tocar el perfil.
- RF-15: CUANDO se cubren los 10 temas, EL SISTEMA lo dice en la conversación y ofrece cerrar el asistente o seguir agregando información.

**Formas de responder**
- RF-16: EL SISTEMA permite escribir, pegar y arrastrar o elegir archivos e imágenes, con los mismos tipos y el mismo límite que el resto de las subidas de la app.
- RF-17: CUANDO se sube un archivo, EL SISTEMA lo lee, usa su contenido para completar los temas que correspondan y lo agrega a «Documentos de la empresa».
- RF-18: CUANDO el administrador pulsa el micrófono, EL SISTEMA graba hasta 5 minutos con un grabador como el de WhatsApp: eliminar, punto rojo, tiempo, barras con el nivel de la voz, pausar o seguir y enviar. Enviar transcribe el audio en el servidor (sin gastar saldo de la IA) y manda el texto como respuesta.
- RF-19: MIENTRAS se transcribe, EL SISTEMA muestra «Transcribiendo el audio…». Desde los 4:30 avisa «Quedan N s» y al llegar a 5:00 pausa solo y avisa «Se llegó al máximo de 5 minutos. Enviar o eliminar el audio.».

**Identidad de la empresa en los documentos** (agregado 2026-11-06)
- RF-36: EL SISTEMA muestra en la sección «Empresa», solo a administradores, un bloque «Identidad» con: logo, ícono (opcional), color principal, color secundario, razón social, NIT, dirección, ciudad, teléfono, correo y sitio web. «Guardar» va al final.
- RF-37: EL SISTEMA acepta el logo y el ícono en PNG, JPG, WebP o SVG, los guarda en una versión PNG para los documentos y permite quitarlos.
- RF-38: SI un color no es un color válido (#RRGGBB), ENTONCES EL SISTEMA no lo guarda y lo dice en lenguaje simple. Cada color se ve con su muestra al lado.
- RF-39: CUANDO el chat crea un Word, PDF, PowerPoint o Excel y la empresa tiene identidad cargada, EL SISTEMA pone el logo en el encabezado o la portada, usa el color principal en títulos y encabezados de tabla, el secundario en líneas y detalles, y el pie con los datos cargados (solo los que existan). El texto del cuerpo sigue oscuro. En Excel van los colores y el pie de impresión, sin logo (taparía los datos). En PowerPoint, el ícono va en la esquina de cada diapositiva (si no hay ícono, el logo).
- RF-40: CUANDO el chat crea un HTML, usa los colores y el logo de la empresa.
- RF-41: SI la persona pide el documento «sin logo» o «sin marca», ENTONCES EL SISTEMA lo crea con el estilo neutro de siempre.
- RF-42: MIENTRAS no haya identidad cargada, los documentos salen como hoy.
- RF-43: SI un color es tan claro que el texto no se leería sobre fondo blanco (o tan oscuro que no se leería texto oscuro encima), ENTONCES EL SISTEMA usa texto oscuro para los títulos y elige texto blanco u oscuro en los encabezados de tabla según el contraste.
- RF-44: EN el asistente, al terminar los temas (o cuando suben un logo o un manual de marca), EL SISTEMA pide la identidad: guarda el logo de una imagen subida y, de un manual de marca, saca colores y datos y los guarda, mostrando qué guardó.
- RF-45: Los datos de identidad son institucionales: los ve cualquier persona por el chat y la API.

**El chat normal y el perfil**
- RF-20: CUANDO alguien pregunta en el chat normal algo que necesita el perfil, EL SISTEMA lo consulta en ese momento. No lo agrega a cada pregunta.
- RF-21: SI quien pregunta no es administrador, ENTONCES EL SISTEMA le entrega solo el nombre y los temas institucionales. No le entrega los delicados ni los documentos, y no le da consejos ni conclusiones sobre la empresa: le responde que esa información es solo para administradores.
- RF-22: EL SISTEMA no permite cambiar el perfil desde el chat normal: se cambia desde la sección «Empresa» o desde el asistente.
- RF-30: CUANDO un administrador, en el chat de la app o por WhatsApp, habla de su empresa (la describe, pide cargar o cambiar su información, o pide consejos y el perfil está vacío o incompleto), EL SISTEMA le ofrece el asistente en una frase con el link. Si la persona no lo quiere usar, la conversación sigue normal por el mismo canal y no se vuelve a ofrecer en esa conversación.
- RF-32: EN el tema «Cómo trabaja», EL SISTEMA pregunta por los procesos de la empresa y, con lo que responde (o lo que deduce de sus respuestas y documentos), propone qué significa cada tipo de tarea en la empresa. Muestra la propuesta y la guarda cuando el administrador la acepta o la corrige. Esta es la única excepción a RF-11, porque condiciona cómo se crean las tareas.
- RF-33: CUANDO el chat de la app, WhatsApp o un asistente crea o propone una tarea, EL SISTEMA elige el tipo según la equivalencia del perfil. Si un tipo figura como «No se usa», no lo propone salvo que la persona lo pida. Sin equivalencia cargada, elige como hoy.
- RF-34: EL SISTEMA mantiene los nombres de los tipos en toda la app: la equivalencia solo orienta a la IA.
- RF-35: EL SISTEMA expone el perfil en la API: lectura con el mismo filtro por rol que el chat (RF-21) y edición de un tema solo para administradores.
- RF-31: EL SISTEMA nunca ofrece el asistente de empresa a quien no es administrador. El ofrecimiento del asistente de proyectos va en la entrega 2, por web y WhatsApp, a quien pueda crear proyectos.

**Errores**
- RF-23: SI no hay un servicio de IA configurado, ENTONCES el botón del asistente queda deshabilitado con el texto «Falta conectar un servicio de IA en Configuración → Bot». La edición a mano sigue funcionando.
- RF-24: SI el servicio de IA falla, no tiene saldo, está ocupado o se acabaron las preguntas del mes, ENTONCES EL SISTEMA muestra el mismo aviso en lenguaje simple que usa el chat normal, y lo escrito no se pierde.
- RF-25: SI la transcripción falla o el micrófono no tiene permiso, ENTONCES EL SISTEMA lo dice en lenguaje simple y se puede seguir escribiendo.
- RF-26: SI alguien que no es administrador entra a la dirección del asistente o usa sus acciones, ENTONCES EL SISTEMA no le muestra nada del perfil y le indica que no tiene acceso.

**Novedad**
- RF-27: EL SISTEMA muestra a los administradores el aviso de novedad de la sección «Empresa» (texto propuesto en el plan, para aprobar).

## Requisitos no funcionales
- Cada respuesta del asistente cuenta como una pregunta del tope mensual del bot y respeta su límite de 50 s por respuesta.
- Los textos visibles van en tercera persona o impersonales, sin jerga técnica. El asistente conversa con el tono y el nombre configurados para el bot.
- Una sola empresa por instalación.

## Casos límite
- Dos administradores editan el mismo tema a la vez: queda el último que guardó.
- Respuesta que cubre varios temas a la vez (por ejemplo, un brochure): se guardan todos los que cubre.
- Archivo que no se puede leer (PDF escaneado con un servicio que no lo admite): se avisa y el archivo igual queda en «Documentos de la empresa».
- Audio en silencio o sin texto reconocible: se avisa «No se entendió el audio».
- Pantalla angosta: ver RF-28.

## Responsive
- RF-28: POR DEBAJO de 1024 px de ancho, la lista de temas se reemplaza por una barra sobre la conversación («<tema en curso> · N de 10») que al tocarla despliega la lista. DESDE 1024 px, la lista va en una columna a la izquierda. En toda medida el asistente ocupa la pantalla completa y el campo de respuesta queda fijo abajo.
- RF-29: La sección «Empresa» de Configuración se lee en una columna en celular, sin scroll horizontal.

## Fuera de alcance
- El asistente de proyectos y el botón «Abrir asistente» en el chat (entrega 2).
- Conclusiones, consejos generados y «Aprendizajes»; el rendimiento por persona para el PM (entrega 3).
- Usar Whisper en el chat normal (sigue con el dictado del navegador).
- Varias empresas en una misma instalación.
- Renombrar los tipos de tarea en la interfaz.
- Fuentes tipográficas propias, plantillas por tipo de documento e identidad de la empresa en la interfaz de la app.
- Tablero de gráficos de la empresa con indicadores elegidos según la entrevista (va con «Aprendizajes», entrega 3, porque usan los mismos datos).

## Criterios de finalización
- Los 35 RF verificados, con `tsc`, lint y un chequeo `verify:company-profile` que cubra el permiso (RF-21, RF-26) y el guardado por tema.
- Lo que no se pueda probar sin navegador (grabar audio, arrastrar archivos, responsive) queda indicado como pendiente de prueba visual.

## Decisiones tomadas en la entrevista
- Quién completa el perfil → solo administradores (definen los objetivos de la empresa).
- Paso a paso → temas con avance; las preguntas siguen siendo libres y se puede saltar un tema.
- Voz → grabar y transcribir con el Whisper del servidor (funciona en celular y no gasta saldo).
- Edición → a mano o con el asistente; al repasar, el asistente muestra lo que hay en cada tema y permite agregar o cambiar.
- Chat normal → consulta el perfil solo cuando la pregunta lo necesita; los administradores ven todo; los demás, solo lo institucional y sin consejos sobre la empresa. Para el PM, lo de su proyecto y el rendimiento de su gente en ese proyecto se resuelve en la entrega 3.
- Tipos de tarea → solo lo que sabe la IA: en «Cómo trabaja» queda qué significa cada tipo en la empresa y el chat, WhatsApp y los asistentes lo usan al crear tareas; los nombres visibles no cambian (pedido al revisar la spec).
- Ofrecer el asistente desde el chat → también por WhatsApp, según quién sea la persona, con el link; si no lo quiere, sigue la conversación normal ahí (pedido al revisar la spec).
- Archivos → se guardan en «Documentos de la empresa».
- Celular → barra arriba con el tema en curso, desplegable.
- Guardado por tema sin confirmación (supuesto: el asistente existe para cargar el perfil y todo se corrige a mano después).

## Cambios
- 2026-11-06 — Todo lo de la empresa sale de Configuración a una sección propia «Empresa» en el menú (después de Rendimiento, solo admin, ruta /company), con el estilo del asistente; ahí irán también los Aprendizajes. El chat grande usa la interfaz del asistente.
- 2026-11-06 — RF-18/19: tope de audio de vuelta a 5 min (pedido del usuario). La transcripción corre en segundo plano y la pantalla consulta cada 2 s, así ningún pedido pasa los 60 s del servidor (medido: 5 min de audio → texto en ~2 min). Grabador estilo WhatsApp y envío directo. RF-39: Excel sin logo.
- 2026-11-06 — Cambio de alcance: identidad de la empresa (logo, ícono, 2 colores y datos legales) aplicada a los documentos que crea el chat (RF-36 a RF-45). Decisiones: bloque en «Empresa» + asistente; principal y secundario; razón social, NIT, dirección, ciudad, teléfono, correo y web; siempre salvo «sin marca».
- 2026-11-05 — Prueba en Chrome: (1) cancelar una propuesta ya no deshace los guardados que la IA mandó junto a ella; (2) el recuadro de Confirmar lista solo lo que pide confirmación; (3) el asistente se dibuja encima de la barra de la app (z-[60]); (4) los archivos subidos se muestran como ficha 📎 en vez de la ruta, también en el chat flotante.
- 2026-11-05 — RF-18: el tope de cada grabación del asistente baja de 5 min a 90 s. Medido en local: 5 min tardan 87 s y 2 min, 30 s; el servidor corta a ~60 s. Era la salida prevista en el plan. WhatsApp sigue con 5 min.
- 2026-11-05 — RF-35 (API) agregado en el plan por la regla de paridad app-bot-API.

## Dudas abiertas
(ninguna)
