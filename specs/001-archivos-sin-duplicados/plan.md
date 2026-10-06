# Plan 001 — Archivos sin duplicados

Estado: aprobado (2026-10-06)

## 1. Inventario de impacto

Entidad que cambia: **el archivo subido** (cómo se nombra y guarda) y **las referencias** a archivos y links.

| Consumidor | Qué hace hoy | Estado |
|---|---|---|
| `saveUploadedFile` (`/api/upload`, `/api/upload/public`, editor de texto, chat del bot, avatar, ícono de proyecto, foto del bot) | Nombre aleatorio (`uuid`) por cada subida | ✅ se ajusta — RF-1, RF-2 |
| Insumos/Evidencias de la tarea (`addAttachmentRecord`, `addLinkAttachment` → `AttachmentUploader`) | Crea siempre | ✅ RF-3, RF-4 |
| Pasos del checklist (`addStepAttachment`, `addStepLinkAttachment` → `StepAttachments`, `StepCheckbox`) | Crea siempre | ✅ RF-3 |
| Ajustes (`addAdjustmentAttachment`, `addAdjustmentLinkAttachment` → `AdjustmentPanel`) | Crea siempre | ✅ RF-3, RF-4 |
| Prueba/QA (`addReviewDeliverable[Link]`, `addReviewCheckEvidence[Link]`, `submitReviewRound` → `ReviewPanel`) | Crea siempre | ✅ RF-3 |
| Aceptación (`addAcceptanceDeliverable[Link]`, `addAcceptanceItemEvidence[Link]`, `submitAcceptanceRound` → `AcceptancePanel`) | Crea siempre | ✅ RF-3 |
| Definición del proyecto (`addProjectAttachment`, `addProjectLink` → `ProjectInsumoUploader`, `ProjectLinksPanel`) | Crea siempre | ✅ RF-3 |
| Link del cliente (`addPublicTaskInsumo[Link]` → `PublicTaskDetail`; `addPublicProjectAttachment`/`Link` → `PublicFilesView`) | Crea siempre | ✅ RF-3, RF-6 |
| Galería del proyecto (`reuseMedia*` → `MediaGalleryButton`) | Usa las funciones de arriba | ✅ RF-3 (hereda el aviso); suma archivos de ajustes y rondas — RF-7 |
| API (`taskDesign.ts`: `addTaskAttachments`, `addAdjustmentItems`, `addAdjustmentAttachments`, `addRoundDeliverables`, `addCheckEvidence`, `addChecksToRound`, `designReviewTask`) y link «Conectar IA» | Crea siempre | ✅ RF-3, RF-6 (devuelven `skipped`) |
| Chat del bot (`chontatecTools`: `attach_uploaded_file`, `attach_link_to_task`, carga múltiple, `design_task`, `manage_design_item`) | Usa `taskDesign` / acciones | ✅ RF-6 (el bot recibe `skipped` y lo comunica) |
| Comentarios con adjuntos (`addShareComment`, `addTeamShareComment`, `addRoundMessage`, `postInternalMessage`) | Copian imágenes como Insumo | ✅ RF-5 (sin aviso; `internalMessageActions` ya evita duplicar por URL; se aplica igual en `shareActions`/`shareThreadActions`) |
| Vista Archivos del proyecto (`projects/[id]/page.tsx` → `ProjectFilesView`) | Una fila por adjunto; sin ajustes ni rondas | ✅ RF-7, RF-8 |
| Vista Archivos general (`projects/page.tsx` → `AllProjectsFilesView`) | Igual | ✅ RF-7, RF-8 |
| Link del cliente — archivos (`publicView.ts`, `PublicFilesView`) | Lista sus propios archivos | ➖ no aplica: el cliente ve solo lo que le corresponde; la agrupación es de la vista interna. Sus subidas sí quedan deduplicadas (RF-1) |
| Borrado de archivos (`fileCleanup.deleteFileIfUnused`) | No cuenta íconos, fotos, textos | ✅ RF-9, RF-10 |
| Servir archivos (`/uploads/[name]`, `/api/html/[name]`) | Aceptan `[A-Za-z0-9._-]` | ➖ no aplica: un nombre de 64 caracteres hex + extensión ya pasa |
| Marcas de comentarios (`commentBody.ts`) | Aceptan `/uploads/<nombre>` | ➖ no aplica: mismo formato |
| `persistentUploads.ts` (recuperar archivos de versiones anteriores) | Copia por nombre | ➖ no aplica: copia igual cualquier nombre |
| Respaldo/exportación, búsqueda y filtros | Copian/listan URLs | ➖ no aplica: siguen siendo URLs `/uploads/…` |
| WhatsApp (avisos con imágenes de comentarios, `loadImageBuffers`) | Lee el archivo por URL | ➖ no aplica: la URL sigue resolviendo; tras la unificación apunta a la copia única |
| Resumen diario, cola de alertas, alertas de grupo (textos guardados) | Pueden contener URLs | ✅ RF-11 (la unificación también reescribe esos textos) |
| Link «Conectar IA» y API de lectura | Devuelven URLs | ➖ no aplica: leen lo que hay; tras la unificación son las nuevas |
| Arranque de la app (`instrumentation.ts`) | `ensurePersistentUploads` | ✅ RF-11 a RF-14 (corre la unificación después) |

## 2. Qué se reutiliza
- `saveUploadedFile` y `uploadWriteDir()` (un solo lugar de escritura): solo cambia el nombre y se evita reescribir.
- La galería ya trata cada URL como un archivo (`seen`): se extiende, no se reemplaza.
- `fileCleanup.deleteFileIfUnused` ya hace conteo de referencias: se amplía.
- Componentes de visor (`AttachmentGrid`, lightbox, visor de documentos) en la vista Archivos: se mantienen.
- Construido desde cero: `src/lib/attachmentDedup.ts` (chequeo «ya está en esta sección») y `src/lib/unifyUploads.ts` (unificación); no existe nada similar.

## 3. Diseño

### 3.1 Nombre por contenido (RF-1, RF-2) — `uploadFile.ts`
```
buffer = bytes del archivo (ya validado: tipo, 20 MB, SVG seguro)
ext    = extensión segura normalizada (.jpeg→.jpg, .htm→.html)
name   = sha256(buffer) + ext
si no existe uploadWriteDir()/name → escribir
devolver { url: "/uploads/" + name, name: nombre original, mimeType }
```
Dos subidas iguales al mismo tiempo escriben el mismo contenido en el mismo nombre: inofensivo.

### 3.2 «Ya está en esta sección» (RF-3, RF-4, RF-5) — `attachmentDedup.ts`
```
type Section = { task, kind } | { step } | { adjustmentItem, kind } | { round } | { check } | { project }
inSection(section, url) → boolean   (url de link normalizada con trim)
ALREADY_LOADED = "Este archivo ya está cargado aquí."
```
Cada acción de §1, antes de crear: `if (await inSection(...)) return { ok: true, duplicate: true }`. Las que hoy no devuelven nada pasan a devolver `{ duplicate?: true }`. **No se lanza error** para esto: en producción Next reemplaza el mensaje de un error lanzado por uno genérico, así que el aviso viaja como resultado.
Cargas múltiples (API, `design`, bot): se crean los nuevos y se devuelve `skipped: [nombres]`.
Comentarios: las copias como Insumo se saltean si ya existen, sin aviso.

### 3.3 Aviso en la interfaz (RF-3)
En los 10 componentes de §1, si `duplicate` → aviso neutro (no rojo) en el mismo lugar donde hoy muestran errores: «Este archivo ya está cargado aquí.»; en subidas de varios: «Ya estaban cargados aquí: a.pdf, b.png».

### 3.4 Vista Archivos (RF-7, RF-8)
En `projects/[id]/page.tsx` y `projects/page.tsx`: sumar adjuntos de ajustes y de rondas, y agrupar por URL:
```
grupos = agrupar(todas las referencias, por url)
cada grupo → { url, nombre de la referencia más antigua, mimeType, usos: [{ dónde (tarea o Definición), sección, nombre propio, link }] }
filtros: tipo / búsqueda por cualquiera de los nombres / tarea = grupos con algún uso en esa tarea
orden: uso más reciente primero
```
`ProjectFilesView` / `AllProjectsFilesView`: cada tarjeta muestra «Usado en N lugares» con la lista (tarea → sección), cada uno con link a la tarea.

### 3.5 Galería (RF-7)
`listReusableMedia` suma adjuntos de ajustes y de rondas del proyecto; mantiene el orden por fecha y un elemento por URL.

### 3.6 Borrado seguro (RF-9, RF-10) — `fileCleanup.ts`
Cuenta además: `Project.iconUrl`, `User.avatarUrl`, `AppSetting.botAvatarUrl`, y los textos que pueden llevar la URL (`InternalMessage.body`, `ShareComment.body`, `ReviewMessage.body`, `Task/Project/Requirement/Objective.description`, `TaskStep.description`, `AdjustmentItem.description/note`, `BotMessage.content`). Los textos se revisan en memoria (sin `contains`, por la falla de collation). Ante cualquier error, no borra (ya aplicado el 2026-10-05).

### 3.7 Unificación (RF-11 a RF-14) — `unifyUploads.ts`, llamada desde `instrumentation.ts`
Corre en cada arranque, pero solo procesa archivos con nombre antiguo (no hash), así que después de la primera vez no hace casi nada (RF-12).
```
1. listar uploadWriteDir(): archivos cuyo nombre NO es <64 hex>.<ext>
2. por cada uno: hash → nuevo nombre; si no existe la copia, copiarla
   mapa viejo→nuevo
3. por cada tabla/columna de §3.6 + todas las columnas fileUrl:
   leer id+columna, reemplazar en memoria todas las URLs viejas del mapa, actualizar solo filas cambiadas
4. mover los archivos viejos a persistent-uploads/_unificados-AAAA-MM-DD/ (no se borran)
5. referencias a archivos que no existen en disco → registro (RF-13)
6. registro: revisados, unificados, referencias actualizadas, espacio liberado, faltantes (RF-14)
```
Si se corta a mitad: los viejos siguen en su lugar, y la próxima corrida recalcula y completa (los pasos son repetibles). Todo con `.catch` (constitución 6): una falla no tumba el arranque.

## 4. Decisiones técnicas
- **Nombre = huella** en vez de una tabla nueva de archivos: no hace falta migración del esquema, y la deduplicación queda garantizada por construcción en todas las vías de subida. Descartado: tabla `StoredFile` con huella única (más código y una migración).
- **Unificación al arranque** y no dentro de `npm run build`: el build de Hostinger no garantiza la carpeta permanente ni `tsx` (dev dependency). El efecto es el mismo («una vez en el deploy»): corre al iniciar la versión nueva.
- **Textos en memoria** en vez de `LIKE`: evita la falla de collation de producción. Techo: recorre las tablas completas una vez por unificación y por cada borrado de archivo (`ponytail:` en el código; pasar a una tabla de referencias si crecen mucho).

## 5. Verificación
- `npx tsc --noEmit`, `npm run lint`.
- Existentes: `verify:persistent-uploads`, `verify:svg-upload`, `scripts/verify-uploads-route.ts`, `verify:paste-image`, `verify:comments`.
- Nuevo `scripts/verify-file-dedup.ts` (`npm run verify:file-dedup`): mismo contenido → misma URL y un solo archivo; `.jpeg`/`.jpg` iguales; `inSection` por cada tipo de sección; `deleteFileIfUnused` no borra si lo usa un ícono o un texto.
- Unificación en la base local: copia de los archivos locales, correr dos veces, comprobar mismo resultado y que toda referencia abra (reusa la auditoría de links).
- ⚠️ Sin probar visualmente salvo autorización: avisos en los 10 componentes y la vista Archivos.

## 6. Cobertura de RF
RF-1, RF-2 → 3.1 · RF-3, RF-4 → 3.2, 3.3 · RF-5 → 3.2 · RF-6 → 3.2 (API/bot/cliente) · RF-7 → 3.4, 3.5 · RF-8 → 3.4 · RF-9, RF-10 → 3.6 · RF-11 a RF-14 → 3.7.
