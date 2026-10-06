# Especificación 001 — Archivos sin duplicados

Estado: implementada

| | |
|---|---|
| Origen | Pedido por chat, 2026-10-05 |

## Pedido original

> "quiero que hagas un verificacion en cuanto lso archivos para evitar duplicidad, si cargas un archivo, con el mismo nombre, formato y peso, entenddemos que es el mismo archivo […] (si hay una forma mas exacta de confirmar que dos archivos son el mismo en un proyecto lo haces) no le decimos al usriao simplente internamen vinculamos la tarea o lo quesea a ese archivo ya existente para no tener dos veces lo mismo en la aplicaiccio. […] si varios tareas usan el mismo documento solo va a existir un solo archivo […] y en la la herramienta de archivo [no] dos veces sino una sollo y de alguna forma s vas a mostrar a la diferentes tareas que está usando ese archvo"

Acordado en la entrevista: ver «Decisiones tomadas en la entrevista».

## Fuentes
- Conversación del 2026-10-05 (pedido y dos rondas de preguntas).
- Código actual: subida (`uploadFile`), galería de medios (ya reutiliza archivos dentro del proyecto), borrado por referencias (`fileCleanup`), vistas de Archivos del proyecto y general.
- Registro de producción del 2026-10-05: el control de borrado falla con `Illegal mix of collations … for operation 'like'` (unas 20 veces en el día).
- Biblioteca de Depura: sin conexión en esta sesión (el servidor no respondió); no se consultó.

## Contexto y objetivo
Hoy cada subida guarda una copia nueva aunque el archivo ya exista, y la vista Archivos lo muestra una vez por cada lugar donde se cargó. El objetivo es que cada archivo exista una sola vez en toda la aplicación, que los lugares que lo usan apunten a esa única copia y que la vista Archivos lo muestre una vez con la lista de dónde se usa. Se nota que funcionó cuando subir un archivo idéntico no crea otro archivo físico y la vista Archivos no lo repite.

## Usuarios
Todas las personas que suben archivos o links: equipo (miembros, revisores, PM, administradores) y clientes por el link compartido. Los permisos para ver, subir y quitar no cambian.

## Historias de usuario
- HU-1. Como miembro del equipo, quiero que un documento que ya existe no se duplique al volver a subirlo, para no llenar la aplicación de copias.
- HU-2. Como miembro del equipo, quiero ver en la vista Archivos cada archivo una sola vez con las tareas y secciones que lo usan, para saber dónde está aplicado.
- HU-3. Como persona que sube un archivo, quiero saber si ese archivo ya estaba cargado en esa misma sección, para no buscarlo dos veces.

## Definiciones
- **Mismo archivo**: dos archivos cuyo contenido es idéntico byte a byte, comprobado con su huella digital (SHA-256). El nombre no cuenta: el mismo contenido con otro nombre es el mismo archivo, y el mismo nombre con otro contenido son archivos distintos.
- **Mismo link**: la misma dirección, sin espacios al inicio ni al final.
- **Referencia**: cada lugar que usa un archivo o un link: insumo o evidencia de una tarea (incluidos los de un paso del checklist), antes/después/insumo de un cambio de Ajuste, entregable o evidencia de una ronda de Prueba/Aceptación, archivo o link de la Definición del proyecto, ícono del proyecto, foto de una persona o del bot, imagen o archivo dentro de un comentario o mensaje, imagen dentro de una descripción.
- **Sección**: el grupo concreto dentro de un lugar: Insumos de la tarea A, Evidencias de la tarea A, Antes del cambio 2, Entregables de la ronda 1, Archivos de la Definición del proyecto, etc.

## Requisitos funcionales (EARS)
- RF-1: CUANDO se sube un archivo cuyo contenido ya existe en la aplicación (en cualquier proyecto), EL SISTEMA no guarda otra copia y hace que el nuevo uso apunte al archivo existente, sin avisar nada.
- RF-2: EL SISTEMA trata como el mismo archivo dos subidas con contenido idéntico aunque tengan distinto nombre o una extensión equivalente (por ejemplo `.jpg` y `.jpeg`); cada lugar conserva el nombre con el que se cargó ahí.
- RF-3: SI se agrega a una sección un archivo o link que esa misma sección ya tiene, ENTONCES EL SISTEMA no lo agrega otra vez y muestra un aviso en lenguaje simple (por ejemplo: «Este archivo ya está cargado aquí.»). Si se agregaban varios a la vez, se cargan los nuevos y el aviso nombra los que ya estaban.
- RF-4: EL SISTEMA permite el mismo archivo en secciones distintas del mismo lugar (por ejemplo, como Insumo y como Evidencia de la misma tarea, o como Antes y Después de un cambio), sin aviso.
- RF-5: CUANDO se adjunta una imagen o archivo en un comentario o mensaje (conversación interna, hilos, comentarios del cliente), EL SISTEMA reutiliza el archivo existente si es idéntico y no muestra aviso.
- RF-6: EL SISTEMA aplica RF-1 a RF-5 igual desde la app, la API (incluido el link «Conectar IA»), el chat del bot y el link compartido con el cliente.
- RF-7: EL SISTEMA muestra en la vista Archivos (del proyecto y la general) cada archivo o link una sola vez, incluidos los de Ajustes (antes, después, insumos) y los de rondas de Prueba/Aceptación (entregables y evidencias), con la lista de dónde se usa: tarea o Definición, y la sección. Los filtros actuales (tipo de archivo, tarea, búsqueda) siguen funcionando.
- RF-8: CUANDO un archivo tiene distintos nombres según el lugar, la vista Archivos muestra el nombre de la primera vez que se cargó, y en la lista «usado en» cada lugar con el nombre con que se cargó ahí.
- RF-9: CUANDO se quita un archivo de un lugar, EL SISTEMA borra el archivo físico solo si ninguna otra referencia lo usa (incluidas las que hoy no se cuentan: ícono del proyecto, fotos, imágenes en descripciones y en comentarios).
- RF-10: SI el control de RF-9 no puede comprobar las referencias, ENTONCES EL SISTEMA no borra el archivo (nunca borra ante la duda) y deja el error en el registro.
- RF-11: CUANDO se despliega la versión con este cambio, EL SISTEMA unifica una sola vez los archivos repetidos que ya existen: deja una copia por contenido, hace que todas sus referencias apunten a ella y aparta las copias sobrantes en una carpeta de respaldo, sin borrarlas.
- RF-12: SI la unificación vuelve a correr, ENTONCES no cambia nada de lo ya unificado (es repetible sin efectos).
- RF-13: SI durante la unificación falta en disco un archivo referenciado, ENTONCES EL SISTEMA lo deja como está y lo informa en el registro, sin frenar el resto.
- RF-14: EL SISTEMA deja en el registro de la aplicación el resultado de la unificación: archivos revisados, repetidos unificados, referencias actualizadas, espacio liberado y archivos faltantes.

## Requisitos no funcionales
- La subida no suma una espera perceptible: la huella se calcula sobre el archivo ya recibido (máximo 20 MB).
- Nada se borra de forma irreversible: las copias sobrantes de la unificación quedan apartadas en la carpeta de respaldo.
- Los textos visibles van en tercera persona o impersonales, sin jerga técnica.

## Casos límite
- Dos personas suben el mismo archivo al mismo tiempo: queda una sola copia y ambas referencias funcionan.
- Archivo idéntico subido por el cliente y por el equipo: una sola copia (RF-1).
- Un archivo quitado de un lugar pero usado como ícono, foto o imagen de una descripción: no se borra (RF-9).
- SVG y HTML: siguen las mismas reglas de seguridad de hoy; la deduplicación no las saltea.
- Un archivo que se perdió antes (no está en disco): la unificación lo informa y no lo toca (RF-13).
- Links que solo difieren en espacios al inicio o al final: son el mismo link.

## Fuera de alcance
- Detectar archivos «parecidos» (la misma imagen redimensionada, el mismo documento en otro formato).
- ~~Normalizar links más allá de quitar espacios (por ejemplo, `http` vs `https`, barra final, parámetros).~~ (pasó a alcance el 2026-10-06, ver «Cambios»)
- Cambiar quién puede ver, subir o quitar archivos.
- Una pantalla para revisar o deshacer la unificación (se revierte con el respaldo de la base y la carpeta de respaldo).

## Criterios de finalización
- Subir dos veces el mismo contenido (en lugares distintos y con nombres distintos) deja un solo archivo físico y las dos referencias abren el archivo.
- Repetir en la misma sección muestra el aviso y no duplica.
- La vista Archivos no muestra repetidos y lista dónde se usa cada uno.
- Quitar una referencia no rompe las demás.
- La unificación corrida dos veces en la base local deja el mismo resultado, con todas las referencias abriendo.
- tsc sin errores y verificaciones existentes de subidas en verde.

## Decisiones tomadas en la entrevista
- Cómo saber si es el mismo archivo → huella del contenido (SHA-256), más exacta que nombre + formato + peso (sugerido y aceptado).
- Alcance → toda la aplicación, un solo archivo físico aunque se suba en proyectos distintos.
- Archivos ya subidos → se unifican también.
- Mismo archivo en el mismo lugar → no se agrega, y se informa que ya está cargado (el usuario pidió avisar en este caso).
- Links → el mismo link es el mismo recurso.
- Vista Archivos → incluye todos (también ajustes y rondas), con «usado en».
- «Mismo lugar» → mismo lugar y misma sección; en secciones distintas se permite.
- Comentarios y chats → sin aviso; solo se reutiliza el archivo físico.
- Unificación en producción → una sola vez durante el deploy (sin vista previa); por eso se hace repetible, sin borrar copias, y se pide respaldo de la base antes del deploy.
- Nombre cuando difiere → el de la primera carga, y el propio en cada «usado en» (asumido, se puede cambiar).
- Error de borrado en producción → se arregla dentro de este cambio porque protege a los archivos compartidos.

## Cambios
- 2026-10-06 — Links: dos links son el mismo si su dirección es la misma ignorando espacios, http/https, «www.», mayúsculas del dominio, barra final y #ancla; un video de YouTube es el mismo en cualquiera de sus formatos. Los parámetros (?a=1) sí distinguen. Aplica a la vista Archivos, la galería, el aviso «ya está cargado aquí» y la API (pedido del usuario: «si la URL es la misma es un mismo link independientemente del nombre»).
- 2026-10-06 — Vista Archivos en masonry de dos columnas (izquierda: links compartidos + imágenes; derecha: links + documentos), sin huecos entre bloques.

## Dudas abiertas
Ninguna.
