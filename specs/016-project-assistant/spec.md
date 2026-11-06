# Especificación 016 — Asistente de proyectos y clientes

Estado: aprobada

| | |
|---|---|
| Origen | Pedido por chat, 2026-11-05 (entrega 2 de 3 del «consultor de la empresa») |

## Pedido original

> «De los cambios pendientes sigue con la fase 2.»

Fase 2, según lo acordado en la entrega 1 (spec 015): asistente de proyectos (si no hay perfil de empresa, primero lo pide; luego proyecto: nombre, de qué trata, tiempos, cliente y su perfil, tareas; crea todo solo tras confirmación) y ofrecerlo por el chat de la app y por WhatsApp a quien pueda crear proyectos.

En la entrevista se sumó, a pedido del usuario, una lista de **Clientes** dentro de «Empresa» para reutilizar la ficha de cada cliente entre proyectos.

## Fuentes
- Spec 015 (asistente y perfil de la empresa): pantalla del asistente, voz, archivos, guardado de la conversación, tipos de tarea según la empresa.
- Código actual: el chat ya crea proyectos, fases, objetivos, requerimientos, tareas, dependencias, etiquetas y roles en el proyecto, con confirmación. El formulario «+ Nuevo proyecto» guarda el cliente como texto suelto.
- Conversación del 2026-11-05 (decisiones abajo).

## Contexto y objetivo
Crear un proyecto bien armado (definición, equipo, fases y tareas con fechas reales) hoy exige muchos pasos a mano o un pedido largo al chat. El asistente guía esa carga conversando, con lo que sabe de la empresa, del cliente y de proyectos anteriores, y crea todo por bloques con confirmación.

Se nota que funcionó cuando un PM arma un proyecto completo (cliente, definición, fases y tareas con responsables y fechas) solo conversando, y el proyecto queda igual que si lo hubiera cargado a mano.

## Usuarios
- **Administrador**: usa el asistente, gestiona la lista completa de Clientes en «Empresa».
- **PM** (quien es PM de al menos un proyecto): usa el asistente; elige o crea clientes desde él y ve la ficha de los clientes de sus proyectos.
- **Miembro común**: no ve el asistente ni se le ofrece. El botón «+ Nuevo proyecto» queda como está.

## Historias de usuario
- HU-1. Como PM, quiero que un asistente me pregunte por el proyecto paso a paso, para armarlo completo sin cargar cada cosa a mano.
- HU-2. Como PM, quiero que me proponga fases, tareas y duraciones basadas en proyectos parecidos, para no partir de cero.
- HU-3. Como administrador, quiero una ficha por cliente que se reutilice en todos sus proyectos.
- HU-4. Como PM, quiero seguir completando con el asistente un proyecto ya creado.

## Definiciones
- **Pasos del asistente** (en este orden): Proyecto (nombre y de qué trata) · Cliente · Tiempos (inicio y cierre) · Equipo (PM y rol de cada persona en el proyecto) · Objetivos · Requerimientos · Fases · Tareas (8 pasos).
- **Bloques de confirmación**: 1) Proyecto, Cliente y Tiempos; 2) Equipo; 3) Objetivos y Requerimientos; 4) Fases y Tareas. Cada bloque se crea recién al pulsar «Confirmar».
- **Paso cubierto**: se deduce de lo que ya tiene el proyecto (descripción, cliente, fecha de cierre, roles cargados, al menos un objetivo, un requerimiento, una fase propia además de «General», una tarea).
- **Proyecto parecido**: proyecto (activo o archivado) que la persona puede ver, del mismo cliente o cuyo nombre o descripción trata del mismo tipo de trabajo.
- **Ficha de cliente**: nombre, logo (opcional), contacto (persona, correo, teléfono) y «Perfil» (texto libre: a qué se dedica, qué espera, cómo es trabajar con él).

## Requisitos funcionales (EARS)

**Clientes**
- RF-1: EL SISTEMA muestra en la sección «Empresa», solo a administradores, el bloque «Clientes»: la lista de clientes con nombre, logo y cantidad de proyectos, y un buscador.
- RF-2: CUANDO un administrador abre un cliente, EL SISTEMA muestra su ficha (datos, contacto y Perfil) y la lista de sus proyectos con link a cada uno; permite editar la ficha a mano («Guardar» al final) y crear clientes nuevos.
- RF-3: CUANDO un administrador elimina un cliente, EL SISTEMA pide confirmación con el diálogo propio de la app; sus proyectos conservan el nombre del cliente como texto y quedan sin ficha.
- RF-4: SI ya existe un cliente con el mismo nombre (sin distinguir mayúsculas, tildes ni espacios de más), ENTONCES EL SISTEMA no crea otro y ofrece usar el existente.
- RF-5: CUANDO se publica esta entrega, EL SISTEMA crea un cliente por cada nombre de cliente distinto que ya tengan los proyectos (con la regla de RF-4) y une cada proyecto a su cliente. Lo que hoy muestra el nombre del cliente sigue mostrándolo igual.
- RF-6: EL SISTEMA reemplaza el campo de texto «Cliente» del formulario «+ Nuevo proyecto» y de la edición del proyecto por un buscador de clientes que permite crear uno nuevo con el nombre escrito («Usar «…»»).
- RF-7: EL SISTEMA muestra a un PM la ficha de los clientes de sus proyectos (desde el proyecto, junto al nombre del cliente) sin acceso a la lista completa de «Empresa».
- RF-8: EL SISTEMA expone los clientes en la API y en el chat con los mismos permisos: listar y ver ficha (admin todo; PM los de sus proyectos), crear (admin y PM), editar y eliminar (solo admin).
- RF-9: EL SISTEMA nunca muestra la ficha del cliente (contacto ni Perfil) en el link compartido con el cliente: ahí sigue solo el nombre, como hoy.
- RF-38: EL SISTEMA muestra en el bloque «Clientes», junto a «Nuevo cliente» (carga a mano), el botón «Crear con asistente», que abre a pantalla completa un asistente corto con 4 pasos: Nombre · A qué se dedica · Contacto · Qué espera (más el logo si lo suben). Al terminar muestra la ficha armada y la guarda con «Confirmar». Es la misma conversación que usa el paso «Cliente» del asistente de proyectos.

**Investigación en internet** (clientes y empresa propia)
- RF-39: CUANDO la persona pasa la página web o las redes de un cliente o de la empresa, EL SISTEMA lee esas páginas y usa lo que encuentra para completar la ficha o el perfil.
- RF-40: CUANDO el servicio de IA conectado tiene buscador (hoy DeepSeek o Claude), EL SISTEMA además investiga en internet al cliente o a la empresa y a su sector con lo que tenga (nombre, ciudad, sector, links), aunque no le hayan pasado links, con un máximo de 5 búsquedas por cliente o empresa en cada conversación.
- RF-41: EL SISTEMA orienta la investigación por lo que la empresa quiere lograr (temas «Qué quiere revisar con la aplicación» y «Consejos que espera» del perfil): por ejemplo, tamaño y presencia digital del cliente, tendencias o competencia del sector, lo que sirva para esos consejos.
- RF-42: CUANDO la investigación trae datos, EL SISTEMA los muestra resumidos con la página de donde salió cada uno y los guarda en la ficha o el perfil solo cuando la persona confirma. Nunca guarda como cierto un dato sin fuente.
- RF-43: SI una página no se puede leer (redes que piden iniciar sesión, sitio caído), ENTONCES EL SISTEMA lo dice en una frase, pide pegar el texto o una captura y sigue con lo demás.
- RF-44: SI el servicio de IA conectado no tiene buscador (Gemini u otro compatible con OpenAI), ENTONCES EL SISTEMA solo lee los links que pasen y lo dice una vez al ofrecer la investigación.
- RF-45: EL SISTEMA aplica RF-39 a RF-44 también en el asistente de empresa (spec 015), para completar el perfil propio.

**Asistente: acceso y pantalla**
- RF-10: EL SISTEMA muestra el botón «Crear con asistente» al lado de «+ Nuevo proyecto» en «Proyectos», y «Completar con asistente» en el encabezado de cada proyecto, solo a administradores y PM (en un proyecto ya creado, solo a su PM y a administradores).
- RF-11: SI alguien que no es administrador ni PM entra a la dirección del asistente, o un PM entra con un proyecto que no es suyo, ENTONCES EL SISTEMA no muestra nada del proyecto y le indica que no tiene acceso.
- RF-12: CUANDO se abre el asistente, EL SISTEMA lo muestra a pantalla completa con la misma interfaz del asistente de empresa: conversación, lista de los 8 pasos con su estado (pendiente, en curso, cubierto) y avance «N de 8».
- RF-13: EL SISTEMA permite escribir, hablar (mismo grabador y transcripción del asistente de empresa), y subir o arrastrar archivos e imágenes. Los archivos que la persona sube quedan en los archivos del proyecto una vez creado.
- RF-14: EL SISTEMA guarda una conversación por proyecto, aparte del chat normal y del asistente de empresa. Al cerrar y volver a abrir el asistente de ese proyecto se retoma donde quedó; «Empezar de nuevo» borra la conversación sin tocar el proyecto.
- RF-15: MIENTRAS el proyecto todavía no fue creado (bloque 1 sin confirmar), EL SISTEMA guarda la conversación como «proyecto nuevo» de esa persona; al confirmar el bloque 1, la conversación pasa a ese proyecto y la pantalla queda en su dirección.

**Asistente: conversación**
- RF-16: CUANDO el asistente arranca un proyecto nuevo, saluda en una frase y pregunta el nombre del proyecto y de qué trata. Una pregunta por mensaje, con una frase de lo que entendió antes de la siguiente.
- RF-17: CUANDO el asistente se abre sobre un proyecto existente, EL SISTEMA marca los pasos ya cubiertos, resume en pocas líneas lo que tiene y pregunta por el primer paso pendiente.
- RF-18: EN el paso Cliente, EL SISTEMA busca entre los clientes que la persona puede ver. Si existe, muestra su Perfil y pregunta si cambió algo; si no existe, pregunta a qué se dedica, el contacto y qué espera, y arma la ficha nueva.
- RF-19: EN el paso Tiempos, EL SISTEMA calcula fechas con el calendario de días hábiles y festivos del país de la app, y avisa si la fecha de cierre pedida no alcanza para las tareas propuestas.
- RF-20: EN el paso Equipo, EL SISTEMA propone personas según su cargo y su carga actual de trabajo, y carga el rol de cada una en el proyecto.
- RF-21: EN los pasos Fases y Tareas, EL SISTEMA propone fases, tareas, duraciones y dependencias con base en (a) lo que contó la persona, (b) «Cómo trabaja» y los tipos de tarea del perfil de la empresa, y (c) los proyectos parecidos. Al usar uno, dice de cuál salió (ej. «En «Panaca web» el diseño tomó 12 días hábiles»). Sin proyectos parecidos, propone desde cero y lo dice.
- RF-22: EL SISTEMA une cada tarea a su requerimiento, le pone el tipo según la equivalencia de la empresa, responsable, fechas, dependencias y las etiquetas que use el proyecto (o las que se acuerden en la conversación).
- RF-23: CUANDO termina un bloque, EL SISTEMA muestra el resumen de lo que va a crear y el botón «Confirmar». Recién al confirmar lo crea; al cancelar no crea nada y pregunta qué cambiar.
- RF-24: CUANDO un bloque se crea, EL SISTEMA marca cubiertos sus pasos y deja en la conversación un aviso corto con lo creado y un link al proyecto.
- RF-25: CUANDO la persona pide saltar un paso, EL SISTEMA lo deja pendiente y sigue con el siguiente.
- RF-26: CUANDO se cubren los 8 pasos, EL SISTEMA lo dice, da el link al cronograma del proyecto y ofrece cerrar o seguir agregando.

**Perfil de empresa incompleto**
- RF-27: SI el perfil de la empresa está vacío y quien abre el asistente es administrador, ENTONCES EL SISTEMA le propone completarlo primero con el link al asistente de empresa y un botón «Seguir sin el perfil».
- RF-28: SI el perfil está vacío y quien abre es PM, ENTONCES EL SISTEMA sigue normal y dice una vez que un administrador todavía no cargó el perfil de la empresa.

**Ofrecerlo desde el chat y WhatsApp**
- RF-29: CUANDO un administrador o PM, en el chat de la app o por WhatsApp, pide crear o armar un proyecto, o habla de uno que quiere empezar, EL SISTEMA le ofrece una vez por conversación el asistente con el link. Si no lo quiere, la conversación sigue normal por el mismo canal y el chat crea el proyecto como hoy.
- RF-30: EL SISTEMA nunca ofrece el asistente de proyectos a un miembro común.

**Errores**
- RF-31: SI no hay servicio de IA configurado, ENTONCES los botones del asistente quedan deshabilitados con el texto «Falta conectar un servicio de IA en Configuración → Bot».
- RF-32: SI el servicio de IA falla, no tiene saldo o se acabaron las preguntas del mes, ENTONCES EL SISTEMA muestra el mismo aviso que el chat normal y lo escrito no se pierde.
- RF-33: SI una parte de un bloque falla al crearse (por ejemplo una tarea), ENTONCES EL SISTEMA crea el resto, dice en lenguaje simple qué no se pudo crear y por qué, y ofrece reintentarlo.
- RF-34: SI la persona pierde el permiso sobre el proyecto mientras conversa, ENTONCES EL SISTEMA no crea nada y le indica que ya no tiene acceso.

**Novedad**
- RF-35: EL SISTEMA muestra el aviso de novedad del botón «Crear con asistente» a administradores y PM, y el de «Clientes» en «Empresa» a administradores (textos propuestos en el plan, para aprobar).

**Asistente de tareas** (cambio de alcance 2026-11-06)
- RF-46: EL SISTEMA muestra «Crear con asistente» DENTRO del popup «Nueva tarea» del proyecto (arriba de «Crear tarea»), solo a quien puede crear tareas (PM del proyecto o administrador). Al pulsarlo abre el asistente de tareas con lo ya escrito en el formulario (título y descripción) como punto de partida.
- RF-47: EL SISTEMA muestra «Completar con asistente» en la ficha de cada tarea, debajo de las etiquetas, al PM del proyecto y a administradores, para completar checklist, insumos y, si aplica, las pruebas o ítems.
- RF-48: EL asistente de tareas tiene 7 pasos: Qué hay que hacer · Tipo · Fase y requerimiento · Responsable y revisores · Fechas y dependencias · Checklist e insumos · Pruebas o ítems (solo Prueba, Ajuste o Aceptación; si no aplica, queda cubierto).
- RF-49: EN el paso Tipo, EL SISTEMA no pregunta por los nombres de los tipos: pregunta por la naturaleza de la tarea (¿deja un archivo o entregable?, ¿alguien la revisa con pruebas antes de seguir?, ¿la tiene que aprobar el cliente?, ¿es una lista de cambios pedidos?) y deduce el tipo con la equivalencia de la empresa; lo muestra en la confirmación.
- RF-50: EN el paso Fechas, EL SISTEMA propone inicio, duración y dependencias según tareas parecidas, la carga del responsable y el calendario de días hábiles.
- RF-51: EL SISTEMA permite crear varias tareas en una conversación; cada tarea (con su checklist, etiquetas y dependencias) se crea con un solo «Confirmar».
- RF-52: EL SISTEMA usa lo que ya se sabe (lo escrito en el formulario o el pedido hecho en el chat) y pregunta solo lo que falta.
- RF-53: EL SISTEMA guarda una conversación por proyecto para tareas nuevas y una por tarea existente, y se retoman.

**Ofrecer asistentes desde el chat con el pedido incluido** (cambio de alcance 2026-11-06)
- RF-54: CUANDO un administrador o PM pide en el chat o por WhatsApp algo complejo (un proyecto, varias tareas, una tarea con muchas partes o con mucha información por definir), EL SISTEMA le ofrece una vez por conversación el asistente que corresponde (de proyectos o de tareas) con su link.
- RF-55: CUANDO se abre un asistente desde ese link, EL SISTEMA arranca con lo que la persona escribió en el chat en las últimas 24 horas como punto de partida, lo resume y pregunta solo lo que falta.

## Requisitos no funcionales
- Cada respuesta del asistente cuenta como una pregunta del tope mensual del bot y respeta su límite de tiempo por respuesta.
- Crear con el asistente usa las mismas reglas y permisos que crear a mano o por el chat (mismas validaciones, avisos de asignación y notificaciones).
- Textos visibles impersonales o en tercera persona, sin jerga técnica; quien ejecuta una tarea es «responsable».

## Casos límite
- Dos clientes con nombres casi iguales en los proyectos existentes («Panaca» y «panaca »): quedan en uno solo (RF-4/RF-5).
- Proyecto existente sin PM activo: el asistente lo dice y solo un administrador puede completarlo.
- Muchas tareas en un bloque: se confirman todas juntas en un solo resumen.
- La persona abre «Crear con asistente» dos veces: retoma la misma conversación de «proyecto nuevo».
- Cliente eliminado mientras un PM conversa: el asistente lo trata como cliente nuevo.

## Responsive
- RF-36: Igual que el asistente de empresa: por debajo de 1024 px, la lista de pasos se reemplaza por una barra sobre la conversación («<paso en curso> · N de 8») que se despliega al tocarla; desde 1024 px, columna a la izquierda; el campo de respuesta queda fijo abajo.
- RF-37: El bloque «Clientes» y la ficha se leen en una columna en celular, sin scroll horizontal.

## Fuera de alcance
- Conclusiones y aprendizajes por cliente o por proyecto (entrega 3).
- Plantillas de proyecto guardadas.
- Que un miembro común use el asistente o cambiar quién puede usar «+ Nuevo proyecto».
- Ficha del cliente visible para el cliente en su link.
- Llevar la conversación guiada completa por WhatsApp: allí se ofrece el link (RF-29).
- Buscador propio de la app para servicios sin búsqueda (Gemini u otros): solo leen links.

## Criterios de finalización
- Los 45 RF verificados con `tsc`, lint y un chequeo `verify:project-assistant` que cubra permisos (RF-8, RF-11, RF-30), la unión de clientes existentes (RF-4, RF-5), el estado de los pasos (RF-17) y que la búsqueda solo se ofrezca con un servicio que la tenga (RF-44).
- Lo que no se pueda probar sin navegador (voz, arrastrar archivos, responsive) queda indicado como pendiente de prueba visual.

## Decisiones tomadas en la entrevista
- Quién usa el asistente → administradores y PM, igual que el chat (el botón «+ Nuevo proyecto» queda como está).
- Perfil del cliente → nueva lista «Clientes» en «Empresa» para reutilizar la ficha (propuesta del usuario; sirve también para la entrega 3).
- PM y clientes → elige o crea desde el asistente y ve la ficha de los clientes de sus proyectos; la lista completa es solo de administradores.
- Proyectos existentes → sus nombres de cliente pasan a la lista y quedan unidos.
- Alcance → definición (objetivos y requerimientos) y cronograma (fases y tareas).
- Confirmación → por bloques; lo confirmado queda creado aunque se corte la conversación.
- Perfil de empresa vacío → al administrador se le pide primero (puede seguir sin él); el PM sigue con un aviso.
- Entradas → «Crear con asistente» en Proyectos y «Completar con asistente» en cada proyecto.
- Proyectos anteriores como referencia → sí (sugerencia aceptada).
- Ficha del cliente → datos fijos + Perfil libre que redacta el asistente.
- Asistente de clientes (pedido al revisar la spec) → pantalla completa, 4 pasos, en «Empresa → Clientes».
- Investigación en internet (pedido al revisar la spec) → el usuario usa DeepSeek, que tiene buscador propio en la conexión que usa la app (verificado en su documentación oficial); investiga cliente y sector aunque no haya links, orientado a los consejos que espera la empresa; también en el asistente de empresa. Los datos encontrados se confirman antes de guardarse (supuesto: lo de internet puede ser de otra empresa con el mismo nombre).
- Responsive y ofrecimiento por WhatsApp → igual que en la entrega 1 (se aplica la misma regla, sin preguntar).

## Cambios
- 2026-11-06 — Asistente de tareas y asistentes ofrecidos desde el chat con el pedido incluido (RF-46 a RF-55), aprobado por el usuario. También: pasos del asistente de proyectos = 8 (corrección de conteo); confirmación con un solo botón por bloque (sin preguntar antes en texto); recuadro agrupado por tipo con nombres.

## Dudas abiertas
(ninguna)
