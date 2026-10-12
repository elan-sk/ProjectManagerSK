# Plan 007 — Arreglos de responsive y táctil

## Inventario de impacto

No cambia ninguna entidad ni dato: todo es interfaz. Se inventarían las instancias de cada tipo de elemento.

| Elemento | Instancias | Estado |
|---|---|---|
| Buscador del header | `HeaderSearch.tsx` (única), montado en `layout.tsx` | ✅ RF-1 a RF-10 |
| Colores del buscador | `KIND_COLOR`, `KIND_DOT`, `GROUP_COLOR` en `HeaderSearch.tsx` | ✅ RF-9, RF-10 |
| `/api/search`, `parseHeaderSearch`, chat/bot, API v1 | — | ➖ no aplica: no cambia qué se busca ni qué se devuelve |
| Menú desplegable | `MobileMenuToggle.tsx` (única) | ✅ RF-11 |
| Paneles del header | `NotificationBell`, `InternalMessageBell`, `HeaderAlerts` (urgentes, devoluciones, revisiones) | ✅ RF-12 |
| `WhatsAppHealthAlert`, `PushSubscribeButton` | — | ➖ no aplica: son un enlace y un botón, no abren panel |
| «Mis proyectos» | `agenda/page.tsx` (única) | ✅ RF-13 |
| Encabezado de objetivo y de requerimiento | `ObjectivesPanel.tsx`, `RequirementsPanel.tsx` | ✅ RF-14 |
| Tarjeta «Descripción» | `DefinitionTab.tsx` (única; con y sin permiso de edición) | ✅ RF-15 |
| Encabezado de tarea | `tasks/[taskId]/page.tsx` (única) | ✅ RF-16 |
| Tablero | `KanbanBoard.tsx`, usado en `projects/[id]/page.tsx` y `projects/page.tsx` | ✅ RF-17 a RF-22 |
| Popup de tarea del calendario | `CalendarTaskLink.tsx`, usado en `ProjectCalendarView.tsx` (proyecto y Panorama) | ✅ RF-23 a RF-26 |
| Calendario de Agenda (lista por día) | — | ➖ no aplica: no usa popup |
| Fichas de link compartido | `SharedLinkTiles.tsx`, vía `AttachmentSections` en Archivos del proyecto, Archivos generales y la tarea | ✅ RF-27 |
| Tarjeta de proyecto | `ProjectSummaryGrid.tsx`, usada en Proyectos y Archivados | ✅ RF-28 |
| Gantt | `GanttView.tsx` + `GanttBar.tsx`, en proyecto y Panorama | ✅ RF-29 a RF-33 |
| Barras de filtros | `agenda/page.tsx`, `MobileFiltersToggle.tsx` (proyecto y Panorama), `ProjectFilesView.tsx`, `AllProjectsFilesView.tsx`, `ProjectSummaryGrid.tsx` | ✅ RF-35 |
| Filtros de Rendimiento | `performance/` | ➖ no aplica: no fue señalado y usa otra composición; se revisa si se pide |
| Estados de la tarea | `TaskStatusControl.tsx` (única) | ✅ RF-36 |
| Fila de acciones del proyecto | `projects/[id]/page.tsx` | ✅ RF-37 |
| Fila de acciones de la tarea | `tasks/[taskId]/page.tsx` | ✅ RF-38 |
| Filas con desplazamiento horizontal | vistas en `projects/[id]/page.tsx` y `projects/page.tsx`; «Todos/Insumos/Resultados» y tipos en `ProjectFilesView.tsx` y `AllProjectsFilesView.tsx` | ✅ RF-39 a RF-41 |
| Tablas de Rendimiento y tablas del chat con `overflow-x-auto` | — | ➖ no aplica: son tablas de datos, no filas de botones |
| Nombre de la app instalada | `public/manifest.json` | ✅ RF-34 |
| WhatsApp, colas, tareas programadas, correo | — | ➖ no aplica: ningún aviso depende de la interfaz |

## Partes

### P1. Buscador compacto y modal — RF-1 a RF-8
- `src/lib/search.ts`: función pura `isCompactSearch(slotWidth, viewportWidth)` (umbral 224 px y 1024 px).
- `HeaderSearch.tsx`: mide su contenedor con `ResizeObserver` y guarda `compact`. El campo, el menú de tipos y los resultados se extraen a un bloque único que se pinta en la barra o, en modo compacto, dentro de un panel superior con fondo, llevado a `document.body` con portal. Mismo estado y mismos atajos en los dos modos.
- En modo compacto se pintan dos botones (lupa y llave). Por debajo de 1024 px los botones se muestran por CSS desde el primer render, para que no parpadee la barra.
- `layout.tsx` + `MobileMenuToggle.tsx`: el buscador sale del panel del menú y pasa a ser hermano del botón de menú. De 1024 px en adelante el panel usa `display: contents` y el orden visual (enlaces, buscador, alertas) se conserva con `order`.
- Reutiliza: todo `HeaderSearch` actual y el patrón de portal de `ModalShell`. Desde cero: solo el contenedor del modal, porque `ModalShell` es un diálogo centrado con título y este es un panel superior sin título.
- Descartado: consultas de contenedor solo en CSS; el atajo de teclado necesita saber en qué modo está.

### P2. Colores del buscador — RF-9, RF-10
- `HeaderSearch.tsx`: tarea → `fuchsia` (50/700 en etiqueta, 500 en punto, 700 en título de grupo), igual que `DEFINITION_LEVEL_COLOR.TASK`; link → `emerald` (50/700 y 500).

### P3. Menú y paneles del header — RF-11, RF-12
- `MobileMenuToggle.tsx`: el panel pasa de `inset-x-0` a `right-0` con ancho de 20 rem y tope `calc(100vw - 1rem)`.
- Nuevo `src/components/AnchoredPopover.tsx`: panel en portal a `body`, posición fija calculada desde el botón, acotado a la pantalla, con alto máximo y ambos ejes de desbordamiento definidos; cierra al tocar fuera. Lo usan `NotificationBell`, `InternalMessageBell` y `HeaderAlerts`.
- `MobileMenuToggle` ignora los toques dentro de ese panel para no cerrar el menú.
- Reutiliza: la regla del proyecto «todo panel fijo va en portal». Desde cero: `AnchoredPopover`, porque `ReferencePopover` pinta una lista de enlaces fija y estos paneles tienen contenido propio.

### P4. Agenda — RF-13
- `agenda/page.tsx`: la lista absoluta con desplazamiento, el tope de 110 px del nombre y la fila sin salto pasan a aplicar solo desde 640 px (`sm:`).

### P5. Definición — RF-14, RF-15
- `ObjectivesPanel.tsx` y `RequirementsPanel.tsx`: por debajo de 640 px el bloque derecho se apila (botones arriba, alertas abajo en fila); desde 640 px, las clases actuales.
- `DefinitionTab.tsx`: por debajo de 640 px el ícono va en la línea del título y la descripción queda a todo el ancho; desde 640 px, igual que hoy.

### P6. Tarea — RF-16, RF-36, RF-38
- `tasks/[taskId]/page.tsx`: fila del título con salto de línea y `order`: en celular título a todo el ancho, luego asignados a la izquierda e ícono a la derecha; desde 640 px, el orden actual.
- `TaskStatusControl.tsx`: en celular los estados van en grilla de columnas iguales con letra `text-xs`; desde 640 px, igual que hoy.
- Fila «Marcar urgente / Duplicar / Eliminar tarea»: sin `overflow-x-auto`; en celular ocupa todo el ancho en partes iguales.

### P7. Tablero — RF-17 a RF-22
- `KanbanBoard.tsx`: `PointerSensor` se cambia por `MouseSensor` (distancia 6) + `TouchSensor` (espera 250 ms, tolerancia 8 px). Se quita `touch-none` de la tarjeta para que el dedo desplace; la tarjeta no permite selección de texto ni menú del sistema al sostener.
- Descartado: `PointerSensor` con espera, porque exige `touch-action: none` y eso es justo lo que impide desplazar.
- Columnas: grilla en una sola fila con columnas de `minmax(17.5rem, 1fr)` (85 % en celular) y `overflow-x-auto` + `overflow-y-hidden` en el contenedor del tablero.
- `autoScroll` limitado al contenedor del tablero con `canScroll`, así las columnas no se mueven solas.
- `projects/[id]/page.tsx` y `projects/page.tsx`: el panel del tablero toma alto fijo también en celular, para que cada columna tenga su desplazamiento.

### P8. Calendario — RF-23 a RF-26
- `CalendarTaskLink.tsx`: se guarda el tipo de puntero del último toque. Con dedo, el primer clic no navega y abre el popup; el popup acepta toques, es un enlace a la tarea y lleva el botón «Abrir tarea». Se cierra al tocar fuera o al desplazar. Con ratón no cambia nada.

### P9. Archivos y tarjetas — RF-27, RF-28
- `SharedLinkTiles.tsx`: ficha con `col-span-2` y título `line-clamp-3` por debajo de 1536 px; nombre completo en `title`.
- `ProjectSummaryGrid.tsx`: el nombre puede encogerse (`min-w-0`) y las miniaturas e íconos no (`flex-shrink-0`).

### P10. Gantt — RF-29 a RF-33
- `GanttView.tsx`: con dedo no se inicia el paneo manual (el navegador desplaza solo). Se agrega `onPointerCancel`, que hoy falta: sin él, un toque cancelado deja el paneo «activo» y el siguiente movimiento devuelve la posición guardada. Esa es la causa del desplazamiento que se devuelve.
- `GanttBar.tsx`: con dedo no se arrastra el cuerpo ni los extremos; un toque abre el popup, que acepta toques y lleva el botón «Abrir tarea».
- Líneas de dependencia: la hipótesis es el mismo paneo atascado, que mueve el desplazamiento por fuera del recorte de las líneas. No está confirmada: se verifica en la tablet después del arreglo y, si persiste, se reporta con lo observado.

### P11. Filtros en dos columnas — RF-35
- Nueva constante compartida de clases para la barra de filtros (grilla de 2 columnas por debajo de 1024 px; fila flexible actual desde 1024 px), usada en los cinco lugares del inventario.
- `ComboFilter`, `DateRangeFilter` y los botones de filtro ocupan todo el ancho de su celda por debajo de 1024 px; «Buscar» ocupa las dos columnas.

### P12. Filas de botones — RF-37, RF-39 a RF-41
- Nuevo `src/components/TabMenu.tsx`: recibe una lista `{ label, href, active }`. Desde 1024 px pinta la fila actual; por debajo, un botón con la opción activa y un desplegable con las demás. Se usa en las dos filas de vistas y en las cuatro filas de Archivos.
- Desde cero: `ComboFilter` no sirve porque navega cambiando un solo parámetro y trae buscador; estas filas tienen enlaces ya armados.
- Fila «+ Nueva tarea / + Contraseña / Compartir»: en celular, una línea en partes proporcionales con letra y relleno menores; desde 640 px, igual que hoy.

### P13. App instalada — RF-34
- `public/manifest.json`: `short_name` → `PMSK`.

## Datos y migraciones

Ninguna.

## Verificación

- `npx tsc --noEmit` y `npm run lint` tras cada parte.
- `npm run verify:search-filters`, ampliado con casos de `isCompactSearch`.
- Lectura de clases por punto de quiebre para cada RF de composición.
- Sin autorización de navegador, lo táctil (RF-17, RF-22 a RF-25, RF-29 a RF-32) y la composición visual quedan «sin probar visualmente»; RF-30 depende de una prueba en la tablet.
