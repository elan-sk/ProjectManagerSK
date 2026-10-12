# Especificación 007 — Arreglos de responsive y táctil

Estado: implementada

| | |
|---|---|
| Origen | Pedido por chat, 2026-10-11 |

## Pedido original

Documento `arreglos_de_responsive_pmsk.md` (6 puntos de Mobile, 13 de Tablet y comportamiento táctil) con una imagen por punto en `~/Descargas/Mobile` y `~/Descargas/Tablet`. Condición del pedido: «Haz las correcciones sin afectar los estilos de escritorio».

Aclaraciones posteriores en el chat:

- Cada carpeta es un grupo y la imagen N corresponde al punto N de ese grupo.
- El buscador se cambia por botones cuando no tiene espacio: en pantallas más chicas que un portátil, o en un portátil cuando «Activar notificaciones» y las alertas activas le quitan ancho.
- Segundo pedido (4 capturas): filtros en grilla de dos columnas, título de la tarea solo, estados en una línea, botones de acción en una línea y filas de vistas sin desplazamiento horizontal.
- Colores: Tareas en el buscador usa el color de tarea de Definición; Links en el buscador lleva un color distinto al de tarea. Ningún color del Gantt cambia.

## Fuentes

- `arreglos_de_responsive_pmsk.md` (adjunto del chat) — los 19 puntos.
- `~/Descargas/Mobile/1.jpeg` a `6.jpeg` — estado actual en celular (≈ 390 px de ancho).
- `~/Descargas/Tablet/1.jpeg` a `11.jpeg` — estado actual en tablet horizontal (1280 px) y vertical (800 px).
- Código del repo: header, buscador, tablero, calendario, Gantt, Definición, Agenda, Archivos.

## Contexto y objetivo

La app se usa también desde celular y tablet. Hoy en esos tamaños no hay buscador a la vista, varios bloques desperdician el ancho o se salen de su contenedor, y con el dedo no se puede recorrer el tablero ni el Gantt. El objetivo es que cada pantalla señalada se pueda leer y operar con el dedo, sin cambiar lo que ve una persona en escritorio con ratón.

## Usuarios

Todas las personas que usan la app (administrador, PM, miembro). No cambia ningún permiso.

## Definiciones

- **Táctil**: la interacción se hace con el dedo (el navegador informa un puntero de tipo toque). Un portátil con ratón no es táctil aunque su pantalla lo sea.
- **Modo compacto del buscador**: el buscador se muestra como dos botones en vez de la barra.
- **Anchos**: celular = menos de 640 px; menú desplegable = menos de 1024 px; pantalla amplia = 1536 px o más.

## Requisitos funcionales (EARS)

### Buscador y header

- RF-1: MIENTRAS el ancho de la ventana sea menor a 1024 px, o la barra del buscador disponga de menos de 14 rem de ancho en el header, EL SISTEMA muestra en su lugar dos botones visibles en el header (fuera del menú desplegable): buscar y contraseñas.
- RF-2: CUANDO se pulsa el botón buscar, EL SISTEMA abre un modal con el buscador completo: campo, «Buscar por tipo», resultados, navegación con teclado y apertura de archivos, links y contraseñas en su visor.
- RF-3: CUANDO se pulsa el botón contraseñas, EL SISTEMA abre el mismo modal con el filtro `contraseñas:` ya aplicado.
- RF-4: CUANDO se pulsa Escape, se toca fuera del modal o se elige un resultado, EL SISTEMA cierra el modal.
- RF-5: EL SISTEMA mantiene el modal dentro de la pantalla: ancho máximo de 36 rem con margen lateral, y resultados con desplazamiento propio.
- RF-6: MIENTRAS la barra disponga de 14 rem o más y la ventana mida 1024 px o más, EL SISTEMA muestra la barra actual sin cambios.
- RF-7: CUANDO se usa Ctrl + Espacio en modo compacto, EL SISTEMA abre el modal con el foco en el campo.
- RF-8: EL SISTEMA muestra «Buscar por tipo» sin que ninguna opción ni etiqueta se salga de su contenedor.
- RF-9: EL SISTEMA muestra Tareas en el buscador (título del grupo, punto del filtro y etiqueta `tareas:`) con el fucsia del nivel Tarea de Definición.
- RF-10: EL SISTEMA muestra Links en el buscador (punto del filtro, etiqueta `links:` y etiqueta «Link» de cada resultado) en verde esmeralda.

### Menú desplegable (menos de 1024 px)

- RF-11: EL SISTEMA muestra el menú como un panel de 20 rem de ancho máximo, pegado a la derecha, con su contenido apilado: enlaces, «Activar notificaciones», alertas y cuenta.
- RF-12: CUANDO se abre un panel del header (notificaciones, mensajes internos, urgentes, devoluciones, revisiones), EL SISTEMA lo muestra completo, por encima del menú y dentro de la pantalla, en cualquier ancho.

### Agenda — «Mis proyectos» (celular)

- RF-13: MIENTRAS el ancho sea menor a 768 px (donde las tarjetas de Agenda se apilan), EL SISTEMA muestra todos los proyectos de «Mis proyectos» sin desplazamiento interno, con el nombre sin tope de ancho y sin recortar ningún dato de la fila (lo que no cabe baja de línea).

### Definición (celular)

- RF-14: MIENTRAS el ancho sea menor a 640 px, EL SISTEMA muestra las alertas de cada objetivo y de cada requerimiento («N en riesgo», «N atrasada», retraso) en una línea propia debajo de los botones, una al lado de la otra.
- RF-15: MIENTRAS el ancho sea menor a 640 px, EL SISTEMA muestra el texto de la descripción del proyecto a todo el ancho de la tarjeta, debajo del ícono y el título.

### Tarea (celular)

- RF-16: MIENTRAS el ancho sea menor a 640 px, EL SISTEMA muestra el título de la tarea solo, a todo el ancho; sin balanceo de líneas; en la línea siguiente van, juntos a la izquierda, el ícono del proyecto, una línea de separación y los asignados con el botón de asignar.

### Tablero (proyecto y Panorama general)

- RF-17: MIENTRAS la interacción sea táctil, EL SISTEMA agarra una tarjeta solo tras un toque sostenido de 250 ms sin desplazarse más de 8 px; un deslizamiento desplaza el tablero o la columna.
- RF-18: MIENTRAS la interacción sea con ratón, EL SISTEMA agarra la tarjeta como hoy (al mover 6 px).
- RF-19: EL SISTEMA muestra las cuatro columnas siempre en una sola fila, cada una con 17,5 rem de ancho mínimo (en celular, 85 % del ancho del tablero).
- RF-20: SI las columnas no caben, ENTONCES EL SISTEMA desplaza horizontalmente el contenedor del tablero, no la página.
- RF-21: EL SISTEMA da a cada columna su desplazamiento vertical propio en todos los anchos.
- RF-22: MIENTRAS se arrastra una tarjeta cerca del borde izquierdo o derecho del tablero, EL SISTEMA desplaza el tablero hacia ese lado; las columnas no se desplazan solas en vertical.

### Calendario (vistas con el popup de tarea)

- RF-23: MIENTRAS la interacción sea táctil, CUANDO se toca una tarea, EL SISTEMA abre su popup sin entrar a la tarea.
- RF-24: CUANDO se toca el popup, EL SISTEMA abre la tarea; el popup incluye el botón «Abrir tarea».
- RF-25: CUANDO se toca fuera del popup o se desplaza la página, EL SISTEMA cierra el popup.
- RF-26: MIENTRAS la interacción sea con ratón, EL SISTEMA se comporta como hoy: el popup aparece al pasar el cursor y un clic abre la tarea.

### Archivos — Links compartidos

- RF-27: MIENTRAS el ancho sea menor a 1536 px, EL SISTEMA muestra cada ficha de link compartido ocupando dos columnas de la grilla, con el título limitado a 3 líneas terminadas en «…» y el nombre completo disponible como descripción emergente.

### Proyectos — tarjetas

- RF-28: EL SISTEMA mantiene dentro de la tarjeta de proyecto las miniaturas de subproyectos y los íconos (colisión, compartir, oculto); lo que se recorta con «…» es el nombre.

### Gantt (proyecto y Panorama general)

- RF-29: MIENTRAS la interacción sea táctil, EL SISTEMA desplaza el Gantt en ambos ejes con el dedo y la posición no se devuelve al soltar.
- RF-30: EL SISTEMA mantiene visibles las líneas de dependencia durante y después del desplazamiento táctil.
- RF-31: MIENTRAS la interacción sea táctil, CUANDO se toca una barra, EL SISTEMA abre su popup con el botón «Abrir tarea»; tocar fuera lo cierra.
- RF-32: MIENTRAS la interacción sea táctil, EL SISTEMA no mueve ni redimensiona barras al deslizar sobre ellas: el deslizamiento desplaza el Gantt.
- RF-33: MIENTRAS la interacción sea con ratón, EL SISTEMA se comporta como hoy (arrastre de barras, doble clic para abrir).

### Filtros, estados y filas de botones (celular y tablet)

- RF-35: MIENTRAS el ancho sea menor a 1024 px, EL SISTEMA acomoda los filtros en una grilla de dos columnas iguales, con cada filtro ocupando todo el ancho de su celda y el campo «Buscar» ocupando las dos columnas. Aplica a todas las barras de filtros: Agenda, proyecto, Panorama general, resumen de Proyectos y Archivos.
- RF-36: MIENTRAS el ancho sea menor a 640 px, EL SISTEMA muestra los estados de la tarea en una sola línea, repartidos en partes iguales y con letra más pequeña, sin que ninguno se salga ni baje de línea.
- RF-37: MIENTRAS el ancho sea menor a 640 px, EL SISTEMA muestra «+ Nueva tarea», «+ Contraseña» y «Compartir» en una sola línea, sin desbordarse, conservando la línea que separa «Compartir».
- RF-38: MIENTRAS el ancho sea menor a 640 px, EL SISTEMA muestra «Marcar urgente», «Duplicar» y «Eliminar tarea» en una sola línea, sin desplazamiento horizontal.
- RF-39: MIENTRAS el ancho sea menor a 1024 px, EL SISTEMA reemplaza la fila de vistas (Definición, Tablero, Gantt, Calendario, Archivos, Comentarios; y la del Panorama general) por un desplegable que muestra la vista actual («Vista: Archivos») y, al tocarlo, lista las demás.
- RF-40: MIENTRAS el ancho sea menor a 1024 px, EL SISTEMA reemplaza por desplegables del mismo tipo las filas de Archivos «Todos / Insumos / Resultados» y la de tipos (Todos, Imágenes, Documentos, Links, Contraseñas); «+ Agregar insumo» queda como botón junto al desplegable.
- RF-41: EL SISTEMA no deja ninguna fila de botones con desplazamiento horizontal en celular ni tablet; de 1024 px en adelante las filas se ven como hoy.

### App instalada

- RF-34: EL SISTEMA usa «PMSK» como nombre corto de la app instalada.

## Requisitos no funcionales

- RNF-1: Con ratón y 1536 px o más de ancho, ninguna pantalla cambia de composición. Excepciones pedidas: colores del buscador (RF-9, RF-10) y la barra del buscador cuando no le queda espacio (RF-1).
- RNF-2: Todo panel flotante nuevo o corregido queda dentro de la pantalla, con ambos ejes de desbordamiento definidos.
- RNF-3: Textos nuevos visibles: «Abrir tarea» y el rótulo «Vista:» del desplegable de vistas. Descripciones para lector de pantalla: «Buscar», «Buscar contraseñas», «Cerrar buscador».

## Casos límite

- El header pasa de barra a botones mientras el buscador tiene texto: se conserva lo escrito.
- Dispositivo con dedo y ratón a la vez: manda el tipo de puntero de cada interacción.
- Tablero con una columna muy larga: solo esa columna se desplaza en vertical.
- Tarea soltada en una columna que no estaba a la vista: se llega con el desplazamiento del RF-22.
- Popup del calendario cerca del borde: se ubica dentro de la pantalla, como hoy.

## Fuera de alcance

- Mover o redimensionar barras del Gantt con el dedo.
- Crear o reconectar dependencias del Gantt con el dedo.
- Cambios en colores del Gantt.
- Rediseño de pantallas no señaladas en el documento (el punto 9 de Tablet no pide cambios).

## Criterios de finalización

- `npx tsc --noEmit`, `npm run lint` y `npm run verify:search-filters` pasan.
- Cada RF queda verificado por lectura de código o comando; lo que requiera pantalla táctil se reporta como «sin probar visualmente» si no se autoriza el navegador.
- Inventario de impacto repasado: todas las instancias de tablero, Gantt, calendario, paneles del header y fichas de link compartido.

## Decisiones tomadas en la entrevista

- «Mis proyectos» en celular → se quitan los dos topes: ancho del nombre y alto con desplazamiento interno.
- Alcance del buscador compacto → por espacio disponible, no por tipo de dispositivo.
- Menú desplegable → panel angosto a la derecha, apilado, como en celular.
- Colores → solo buscador: Tareas en fucsia de Definición y Links en un color distinto (verde esmeralda). El Gantt no cambia de color.
- Título de la tarea en celular → título solo; debajo, asignados a la izquierda e ícono del proyecto a la derecha (pedido del 2026-10-11, reemplaza el supuesto inicial).
- Filas de botones sin desplazamiento horizontal → desplegable con la vista actual (se descartaron la grilla repartida y los íconos).
- Estados de la tarea en una línea → letra más pequeña en partes iguales, sin íconos.
- 2026-10-12, a pedido: en RF-16 el ícono y los asignados quedan juntos a la izquierda, separados por una línea (el hueco entre ambos se veía raro).
- 2026-10-12, a pedido: en RF-16 se invierte la fila (ícono a la izquierda, asignados a la derecha) y el título en celular va sin balanceo de líneas.
- 2026-10-11, al planear: el estado de WhatsApp del header sale de RF-12, porque es un enlace y no abre panel.
- 2026-10-11, al implementar: RF-13 pasa de 640 a 768 px, porque ese es el ancho real en que «Mi rendimiento» y «Mis proyectos» se apilan.
- Supuesto (punto 5 de Tablet): la ficha de 2 columnas aplica por debajo de 1536 px, porque la tablet horizontal de la imagen mide 1280 px.
- Supuesto (punto 12 de Tablet): con el dedo se prioriza desplazar el Gantt; mover barras queda para ratón.
