# Especificación 012 — Compresión de imágenes de proyectos archivados

Estado: implementada

| | |
|---|---|
| Origen | Pedido por chat, 2026-10-24 |

## Pedido original

> «para que la aplicación no se extienda al infinito […] no quiero que mis cosas las tenga un tercero»
> «que se pase el webp con pérdidas solo para los proyectos archivados con la condición que dices que no se usa en otro lugar, para que los diseñadores trabajen con su archivo normal, cuando se acaba el proyecto que se archive no se pierden las imágenes pero sí se comprimen para que ocupen menos espacio»
> «La imagen si no se están usando deberían eliminarse también» (sobre proyectos eliminados)

## Fuentes

- Conversación del 2026-10-24 (viabilidad de Cloudflare descartada por el usuario: los archivos se quedan en el hosting propio).
- Código: `fileReferences.ts` (lista de lugares que usan un archivo), `unifyUploads.ts` (reescritura de direcciones), `fileCleanup.ts`, `uploadFile.ts`, `setProjectArchived` (archivar) y `archiveProject` (eliminar).

## Contexto y objetivo

Las imágenes subidas se guardan en el disco del hosting y el espacio crece sin tope. Mientras un proyecto está activo, el equipo necesita los archivos originales (diseño). Cuando el proyecto termina y se archiva, sus imágenes pueden pasar a un formato liviano sin perderse. Las de proyectos eliminados que nadie más usa se borran.

## Usuarios

- Admin o PM que archiva o elimina un proyecto: no ve nada distinto; el proceso corre en segundo plano.
- Cualquier persona que abre un proyecto archivado: ve las mismas imágenes, más livianas.

## Definiciones

- **Proyecto activo**: no archivado y no eliminado.
- **Uso que protege** una imagen (la deja intacta): un uso dentro de un proyecto activo, la foto de un usuario, la foto del bot, o la dirección escrita dentro de un `.md`, `.html` o `.txt` subido.
- **Uso neutro**: notificaciones, mensajes del bot, alertas de grupo y cola de WhatsApp. No protegen la imagen, pero su dirección se actualiza igual.
- **Imagen candidata**: PNG o JPG (`.png`, `.jpg`, `.jpeg`) cuyos usos están todos en proyectos archivados o eliminados (más usos neutros).

## Requisitos funcionales

- RF-1: CUANDO se archiva un proyecto (con sus subproyectos), EL SISTEMA, en segundo plano, comprime a WebP cada imagen candidata que tenga al menos un uso en un proyecto archivado.
- RF-2: CUANDO se elimina un proyecto, EL SISTEMA, en segundo plano, borra del disco cada imagen candidata cuyos usos están todos en proyectos eliminados (más usos neutros); si alguno de sus usos está en un proyecto archivado, la comprime (RF-1) en lugar de borrarla.
- RF-3: SI una imagen tiene al menos un uso que protege, ENTONCES EL SISTEMA no la toca.
- RF-4: Comprimir = WebP con calidad 80; si el lado más largo pasa de 2560 px se reduce a 2560 px manteniendo la proporción; nunca se agranda.
- RF-5: SI el WebP resultante no pesa menos que el original, ENTONCES EL SISTEMA deja la imagen como está.
- RF-6: Al comprimir, EL SISTEMA cambia la dirección vieja por la nueva en todos los lugares que la usan (incluidos los usos neutros y los textos con imágenes pegadas); en los adjuntos el tipo pasa a `image/webp` y la extensión del nombre a `.webp` (`captura.png` → `captura.webp`).
- RF-7: EL SISTEMA borra la imagen original solo después de cambiar todas sus direcciones y comprobar que ya nada la usa.
- RF-8: CUANDO la app arranca, EL SISTEMA corre una vez el mismo proceso para los proyectos que ya estaban archivados o eliminados.
- RF-9: CUANDO se desarchiva un proyecto, sus imágenes quedan comprimidas (no vuelven al original).
- RF-10: SI falla el proceso de una imagen (archivo faltante, imagen dañada, error de la base), ENTONCES EL SISTEMA la deja como estaba, lo registra en el log y sigue con las demás; archivar o eliminar el proyecto nunca falla por esto.
- RF-11: MIENTRAS un proceso está corriendo, EL SISTEMA no arranca otro a la vez; si se archiva o elimina otro proyecto en ese momento, se vuelve a correr al terminar.
- RF-12: EL SISTEMA no toca SVG, GIF, WebP, PDF, documentos ni comprimidos.

## Requisitos no funcionales

- Mismo criterio de nombre por contenido que el resto de las subidas: si el WebP ya existe, se reutiliza.
- No bloquea la respuesta de archivar o eliminar.
- Al terminar deja en el log un resumen: imágenes comprimidas, borradas, protegidas, fallidas y espacio liberado.

## Casos límite

- La misma imagen en un proyecto archivado y en uno activo → no se toca (RF-3).
- Imagen usada en un proyecto archivado y en uno eliminado → se comprime (RF-2).
- Subproyecto archivado junto con su principal → cuenta como archivado.
- Tarea archivada dentro de un proyecto activo → el proyecto es activo; la imagen no se toca.
- Ícono de un proyecto archivado → se comprime como cualquier imagen.
- Archivo que figura en la base pero falta en disco → se informa en el log y no se toca.

## Fuera de alcance

- Borrar PDF, documentos u otros archivos de proyectos eliminados (solo imágenes).
- Volver al original al desarchivar.
- Mostrar el progreso o el resultado en la interfaz.

## Criterios de finalización

- `npx tsc --noEmit`, `npm run lint` y `verify:file-dedup` en verde.
- Chequeo ejecutable nuevo `scripts/verify-archived-image-compression.ts` que cubra RF-1 a RF-7, RF-12.
- Corrida en local sobre los datos reales: resumen del log y ninguna imagen rota en un proyecto archivado.

## Decisiones tomadas en la entrevista

- Servicio externo (Cloudflare R2/Images) → descartado: los archivos se quedan en el hosting propio.
- Original tras comprimir → se borra (es lo único que libera espacio).
- Proyectos ya archivados → sí, una vez al arrancar.
- Tamaño → máximo 2560 px de lado.
- Proyectos eliminados → la imagen que solo usan proyectos eliminados se borra; los eliminados no se recuperan desde la app.
- Nombre del adjunto → pasa a `.webp`.
- Archivos `.md`/`.html` subidos → se revisan; si enlazan la imagen, la protegen.

## Dudas abiertas

(ninguna)
