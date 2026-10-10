# Plan 005 — El chat crea archivos

## Inventario de impacto

Lo que cambia: (a) el chat recibe una herramienta nueva, `create_file`; (b) aparecen archivos en la carpeta de subidas que no subió una persona.

### Consumidores de las herramientas del chat

| Consumidor | Estado | Detalle |
|---|---|---|
| Reparto de herramientas por rol (`getToolsForUser`) | ✅ RF-17 | `create_file` va en `READ_TOOLS`, que reciben todos los roles. |
| Ciclo del chat (`runConversationLoop`) | ✅ RF-5, RF-14 | Se ejecuta en el momento, sin confirmación. Se agrega el caso «respuesta cortada por tope». |
| Confirmación de acciones (`confirmChontatecAction`) | ✅ RF-6 | Si `create_file` viaja en el mismo bloque que una acción de escritura, se ejecuta al confirmar por la rama de lectura que ya existe. |
| Servicios formato OpenAI (`botOpenAI.ts`) | ✅ RNF-6, RF-14 | El esquema es simple y pasa por `normalizeSchema`. Hoy no distingue la respuesta cortada (`finish_reason: "length"`): se agrega. |
| Reglas del chat (`chontatec.ts`) | ✅ RF-1, RF-12, RF-13, RF-14 | La línea «Archivos» pasa a decir que también crea, con formatos y tope de tamaño. |
| Recorte de historial (`botHistory.ts`) | ➖ | Los pasos de lectura no se guardan; el enlace queda en el texto de la respuesta. |
| Cupo de preguntas del chat | ➖ | Crear un archivo es parte de la misma pregunta. |
| Widget del chat (`ChontatecWidget.tsx`) | ➖ RF-3, RF-4 | Ya convierte `[nombre](/uploads/…)` en botón que abre el visor con ese nombre. |
| Bot de WhatsApp | ➖ | No importa `chontatecTools` (comprobado con grep); fuera de alcance. |
| API v1 y «Conectar IA» | ➖ | No usan las herramientas del chat. |

### Consumidores de los archivos subidos

| Consumidor | Estado | Detalle |
|---|---|---|
| Guardado (`saveUploadedFile`) | ✅ RNF-4 | Se reutiliza tal cual: lista blanca, huella de contenido, carpeta permanente, regla de HTML. |
| Ruta que sirve archivos (`/uploads/[name]`) | ➖ | Ya sirve todas las extensiones de RF-2. |
| HTML subido (`/api/html`, envoltorio con sandbox) | ➖ RF-12 | El HTML creado se guarda y se sirve igual que uno subido. |
| Visores (`FileViewer`, `AttachmentPreviewModal`) | ➖ RF-3 | Word, Excel, PDF, texto, CSV, Markdown y HTML tienen vista previa con botón «Descargar»; PowerPoint se descarga. |
| Adjuntar (`attach_uploaded_file`, `add_task_files`, `post_thread_comment`) | ➖ RF-6 | Solo comprueban que el archivo exista; aceptan el creado sin cambios. |
| Lectura de archivos del chat (`read_uploaded_file`) | ➖ | Solo lee lo que la persona subió; releer un archivo creado no está en la spec. |
| Limpieza (`fileCleanup`, `fileReferences`) | ➖ | Sin cambios: un archivo creado y no adjuntado queda guardado, igual que uno subido al chat. |
| Duplicados (spec 001) | ➖ | Mismo contenido, misma copia física. |
| Buscador, galería, link compartido, avisos y WhatsApp | ➖ | Solo ven el archivo cuando la persona lo adjunta, por el camino de siempre. |
| Deploy en Hostinger | ➖ | Corre `npm install`: las dependencias nuevas se instalan solas. |

## Qué se reutiliza

- `saveUploadedFile` (`src/lib/uploadFile.ts`): guardado, validación y regla de HTML.
- `marked` (ya instalado): su `lexer` convierte el Markdown en bloques.
- `exceljs` (ya instalado): Excel.
- `prepareFileForBot` (`src/lib/botFilePrep.ts`) y `jszip`: para releer los archivos en el chequeo.
- Visor, enlaces del chat y herramientas de adjuntar: sin cambios.

Se construye desde cero: el armado de cada formato. Dependencias nuevas: `docx`, `pdfkit` (+ `@types/pdfkit`) y `pptxgenjs`.

## Archivos

| Archivo | Cambio | RF |
|---|---|---|
| `src/lib/botFileCreate.ts` (nuevo) | Función pura `buildFile(fileName, content)` → `{ name, buffer }` o error con mensaje simple. Sin base de datos ni disco. | RF-2, RF-7 a RF-11, RF-13 |
| `src/lib/chontatecTools.ts` | Definición de `create_file` en `READ_TOOLS` y su caso en `runReadTool`: permiso de HTML, `buildFile`, `saveUploadedFile`, resultado con el enlace listo. | RF-1, RF-4, RF-5, RF-12, RF-15 a RF-17 |
| `src/lib/chontatec.ts` | Regla «Archivos» y caso de respuesta cortada. | RF-1, RF-13, RF-14 |
| `src/lib/botOpenAI.ts` | Devolver `max_tokens` cuando `finish_reason` es `length`. | RF-14 |
| `next.config.ts` | `pdfkit` en `serverExternalPackages` (lee sus fuentes del disco). | RF-2 |
| `package.json` | Tres dependencias y el script `verify:bot-create-file`. | — |
| `scripts/verify-bot-create-file.ts` (nuevo) | Chequeo ejecutable. | Todos los de formato |
| `scripts/verify-bot-openai.ts` | Caso `finish_reason: "length"`. | RF-14 |

## Lógica principal

La herramienta recibe solo `fileName` y `content`. El formato sale de la extensión del nombre.

```
buildFile(fileName, content):
  nombre = limpiar(fileName); ext = extensión
  si ext no admitida → error «formatos disponibles: …»
  si content vacío → error «falta el contenido»
  si ext es md, txt, csv o html → buffer = content tal cual
  si no:
    bloques = marked.lexer(content) → título | párrafo | lista | tabla
    título del documento = primer «# …», o el nombre sin extensión
    fecha = hoy en es-CO, zona America/Bogota
    docx → librería docx: encabezado, bloques, pie con número de página
    pdf  → pdfkit: encabezado, bloques (doc.table para tablas), número de página con bufferPages
    xlsx → exceljs: cada «## …» abre una hoja; cada tabla, sus filas; primera fila en negrita; celda numérica como número
    pptx → pptxgenjs: portada con título y fecha; cada «## …» abre una diapositiva con sus viñetas o su tabla; número de diapositiva
  devolver { name, buffer }

create_file (en runReadTool):
  si ext es html y la persona no es administradora ni PM → error «solo administradores y PM»
  r = buildFile(...)
  guardado = saveUploadedFile(new File([r.buffer], r.name), { allowHtml })
  devolver { link: "[name](url)", nota: «mostrar este enlace tal cual; adjuntar solo si lo piden» }
```

Respuesta cortada (RF-14): si el servicio de IA corta por tope de tokens y el bloque trae `create_file`, no se ejecuta; el modelo recibe como resultado «contenido demasiado largo: avisar y proponer dividir en partes». Además la regla del chat fija el tope (unas 1.200 palabras por archivo) para que proponga dividir antes de intentarlo.

Límite conocido de RF-14: si el corte es por tiempo (50 segundos) y no por tokens, la persona ve el aviso general de demora que ya existe, sin la propuesta de dividir. Tampoco se entrega un archivo incompleto.

## Decisiones técnicas

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Un solo campo `content` en Markdown para todos los formatos | Campos propios por formato (`sheets`, `slides`) en JSON | Esquema más corto en cada pregunta (RNF-3) y el Markdown gasta menos tokens que el JSON, que es justo el límite de tamaño. |
| Formato por la extensión del nombre | Campo `format` aparte | Un dato menos y sin contradicciones entre nombre y formato. |
| `create_file` como herramienta de lectura | Herramienta de escritura con confirmación | Decisión de la spec (RF-5): no modifica proyectos. |
| PDF con `pdfkit` | `pdfmake` | Tablas y numeración de páginas propias y más liviano; `pdfmake` suma una capa encima del mismo `pdfkit`. |
| Fuente estándar Helvetica en PDF | Incrustar una fuente con emojis | Cubre acentos y ñ (RNF-2) sin archivos extra; los emojis quedan fuera (caso límite de la spec). |
| Excel: una celda es número solo si es un número sin ceros a la izquierda | Convertir todo lo que parezca número | Un código como «007» o un teléfono deben seguir siendo texto. |
| Tope de tokens de Claude sin cambios (4.096) | Subirlo a 8.192 | El límite que manda es el de 50 segundos; subir el tope solo daría más cortes por tiempo. |

## Datos

Sin cambios en la base de datos ni migraciones.

## Verificación

- `npm run verify:bot-create-file` (nuevo): arma un archivo por formato con texto en español, títulos, lista y tabla, y lo vuelve a leer. Comprueba acentos, encabezado, tabla, número guardado como número en Excel, «007» como texto, nombre limpiado, error por contenido vacío y por formato no admitido.
- `npm run verify:bot-openai`: caso de respuesta cortada.
- `npm run verify:bot-file-prep`, `npm run verify:bot-history`, `npx tsc --noEmit`, `npm run lint`.
- Lectura de código para RF-3, RF-4, RF-6 (caminos que no cambian).
- Sin verificar salvo autorización: `npm run build` (ejecuta migraciones) y la prueba en el navegador con un servicio de IA real, incluida la apertura de los archivos en Word, Excel y PowerPoint.
