# Especificación 005 — El chat crea archivos

Estado: aprobada

| | |
|---|---|
| Origen | Pedido por chat, 2026-10-09 |

## Pedido original

> «Pudes aydar a darle la capacida al cha de crar aarchivo y adjuntarlo o darme le la docn de pdsr descaraglo»

Con una captura del chat de la app: la persona pide «crear un informe en formato docx» y el chat responde que solo lee archivos y los adjunta, pero no los crea.

Acordado en la entrevista: formatos Word, Excel, texto (.md, .txt, .csv), PDF, HTML y PowerPoint; se acepta el límite de tamaño por archivo; Word, PDF y PowerPoint llevan encabezado simple; lo usan todos los miembros.

## Fuentes

- Conversación del 2026-10-09 (pedido y captura) — el problema y los formatos.
- `MEMORY.md` del repo — límites del chat (50 segundos por respuesta, ahorro de tokens), visores de archivos, regla de HTML.
- `docs/constitution.md` — principios 1, 2, 5, 6 y 7.
- Código del chat (herramientas, reglas, widget) y de la subida de archivos — qué ya existe.
- Biblioteca Depura — barrido hecho, nada aplicable.

## Contexto y objetivo

El chat de la app consulta proyectos y tareas, lee archivos y los adjunta, pero no puede entregar su respuesta como archivo. Hoy la persona debe copiar el texto, pegarlo en otro programa, guardarlo y subirlo.

Objetivo: que la persona pida un archivo en el chat, lo reciba ahí mismo para verlo y descargarlo, y pueda dejarlo adjunto en la app sin salir del chat.

Se nota que funcionó cuando el pedido de la captura («crear un informe en formato docx») termina con un archivo .docx que se abre en Word.

## Usuarios

- Todos los miembros con acceso al chat: crean archivos con la información que ya pueden ver.
- Administradores y PM: además pueden crear archivos HTML.

## Historias de usuario

- HU-1. Como miembro, quiero pedirle al chat un informe en Word o PDF para compartirlo sin copiar y pegar.
- HU-2. Como miembro, quiero pedirle al chat una tabla en Excel o CSV para trabajarla en una hoja de cálculo.
- HU-3. Como PM, quiero pedirle al chat una presentación corta en PowerPoint para una reunión.
- HU-4. Como miembro, quiero que el archivo creado quede adjunto a una tarea como Insumo o Resultado.

## Definiciones

- Archivo creado: archivo que arma el chat a pedido de la persona, guardado igual que un archivo subido.
- Encabezado simple: título del documento y fecha de creación al inicio; número de página en Word y PDF, número de diapositiva en PowerPoint. Sin logo.

## Requisitos funcionales (EARS)

- RF-1: CUANDO la persona pide un archivo en un formato admitido, EL SISTEMA lo crea y el chat responde con el nombre del archivo como enlace.
- RF-2: EL SISTEMA admite estos formatos: Word (.docx), Excel (.xlsx), PDF (.pdf), PowerPoint (.pptx), Markdown (.md), texto (.txt), CSV (.csv) y HTML (.html).
- RF-3: CUANDO la persona pulsa el enlace de un archivo creado, EL SISTEMA lo abre en el visor de archivos de la app, con su botón de descarga; si el formato no tiene vista previa (PowerPoint), lo descarga directamente.
- RF-4: EL SISTEMA descarga el archivo con el nombre que le dio el chat y la extensión del formato.
- RF-5: EL SISTEMA crea el archivo sin pedir confirmación, porque no modifica ningún proyecto ni tarea.
- RF-6: CUANDO la persona pide adjuntar un archivo creado, EL SISTEMA lo adjunta con las mismas acciones y la misma confirmación que un archivo subido al chat (Insumo o Resultado de una tarea, o adjunto de un comentario).
- RF-7: EL SISTEMA arma Word y PDF con títulos, párrafos, negritas, listas y tablas.
- RF-8: EL SISTEMA arma Excel con una o varias hojas, cada una con su nombre, su fila de encabezados resaltada y sus filas.
- RF-9: EL SISTEMA arma PowerPoint con una diapositiva de portada y diapositivas de título con viñetas o con una tabla.
- RF-10: EL SISTEMA pone en Word, PDF y PowerPoint el encabezado simple.
- RF-11: EL SISTEMA guarda Markdown, texto, CSV y HTML con el contenido tal cual, sin agregar nada.
- RF-12: SI quien pide un archivo HTML no es administrador ni PM de algún proyecto, ENTONCES EL SISTEMA no lo crea y el chat explica que ese formato es solo para administradores y PM, y ofrece otro formato.
- RF-13: SI el formato pedido no está admitido, ENTONCES EL SISTEMA no crea nada y el chat indica los formatos disponibles.
- RF-14: SI el contenido pedido supera lo que el chat puede escribir en una respuesta, ENTONCES EL SISTEMA no entrega un archivo incompleto: el chat avisa que es demasiado largo y propone dividirlo en partes.
- RF-15: SI falla la creación del archivo, ENTONCES EL SISTEMA muestra un mensaje en lenguaje simple y el chat sigue funcionando.
- RF-16: EL SISTEMA crea el archivo solo con información que la persona puede ver: las consultas previas respetan los permisos actuales del chat.
- RF-17: EL SISTEMA permite crear archivos a todos los miembros con acceso al chat.

## Requisitos no funcionales

- RNF-1: Un archivo creado abre sin avisos de reparación en Word, Excel, PowerPoint, un lector de PDF, WPS y Google Docs.
- RNF-2: Los acentos, la ñ y los signos del español se ven bien en todos los formatos.
- RNF-3: La capacidad nueva se ofrece al servicio de IA como una sola herramienta con descripción breve, para no encarecer cada pregunta.
- RNF-4: Los archivos creados se guardan en la carpeta permanente y sobreviven a un despliegue, igual que los subidos.
- RNF-5: Los textos nuevos de la app van en tercera persona o impersonal y sin jerga técnica.
- RNF-6: Funciona con todos los servicios de IA que admite el chat (formato Anthropic y formato OpenAI).

## Casos límite

- Nombre con caracteres no válidos o sin extensión: se limpia y se le pone la extensión del formato.
- Contenido vacío: no se crea el archivo y el chat pide el contenido.
- Mismo contenido creado dos veces: en Markdown, texto, CSV y HTML se guarda una sola copia física; Word, Excel, PDF y PowerPoint llevan dentro su hora de creación, así que cada vez es un archivo distinto.
- Excel con celdas numéricas: los números quedan como número, no como texto.
- Tabla con muchas columnas en PDF o PowerPoint: se reparte el ancho disponible y el texto se ajusta dentro de la celda.
- Emojis en PDF: no se dibujan; el archivo se crea igual, sin ellos.
- Archivo creado y nunca adjuntado: queda guardado, igual que un archivo subido al chat y no adjuntado.
- Pantalla angosta (móvil): el enlace del archivo se ajusta al ancho de la burbuja como cualquier enlace del chat.

## Fuera de alcance

- Imágenes, gráficos o logos dentro de los archivos.
- Informes armados por el servidor sin límite de páginas.
- Editar un archivo ya creado o uno existente (se crea uno nuevo).
- Formatos antiguos (.doc, .xls, .ppt) y cualquier otro no listado en RF-2.
- Limpieza automática de archivos creados que nunca se adjuntaron.
- Crear archivos desde el bot de WhatsApp.
- Plantillas de diseño o colores por proyecto.

## Criterios de finalización

- Todos los RF verificados: los de creación por formato con un chequeo ejecutable que arma cada archivo y lo vuelve a leer; los de interfaz, por lectura de código o con prueba en navegador si se autoriza.
- `npx tsc --noEmit`, `npm run lint` y los `verify:*` del chat en verde.
- Inventario de impacto repasado consumidor por consumidor.

## Decisiones tomadas en la entrevista

- ¿Qué formatos? → Word, Excel, texto, PDF, HTML y PowerPoint (pedido de la persona).
- ¿Cómo se arma el .docx? → con la librería `docx` (abre bien en todos los programas).
- ¿Cómo se maneja el límite de tamaño? → se acepta; si el pedido es muy largo, el chat avisa y propone dividirlo.
- ¿Qué aspecto llevan Word, PDF y PowerPoint? → encabezado simple, sin logo.
- ¿Quién puede crear archivos? → todos los miembros; HTML solo administradores y PM (misma regla que la subida de archivos).
- ¿Crear pide confirmación? → no; adjuntar sí, como hoy (propuesto por Claude, sin objeción).

## Cambios
- 2026-10-09 — Caso límite «mismo contenido creado dos veces» precisado: la copia única aplica solo a los formatos de texto (hallado en la implementación).
- 2026-10-09 — El CSV se guarda con marca de codificación (BOM) al inicio, invisible, para que Excel muestre bien acentos y ñ (RNF-2); el resto del contenido va tal cual (RF-11).

## Dudas abiertas

Ninguna.
