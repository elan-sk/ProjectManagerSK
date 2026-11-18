# Especificación 019 — Filtros con varios elegidos y ocultar

Estado: aprobada

| | |
|---|---|
| Origen | Pedido por chat, 2026-11-18 |

## Pedido original

> Cuando se le da clic directamente a un ítem debe filtrar solo ese; a la derecha, al final, 3 botones: uno con un +, para agregar al filtro (podría seleccionar varios ítems a la vez), un − para desagregarlo y por último un ojo, que va a quitar ese ítem de los resultados: si tengo oculto a Elan, en los resultados no va a salir ninguna tarea donde esté esa persona. Al pasar el mouse: «Agregar», «Quitar» y «Ocultar». Cuando esté seleccionado el ítem debe verse seleccionado y cuando esté oculto también algo que haga entender que se ocultó. Íconos con el estilo de la aplicación. Esto lo aplicás a todos los filtros.

Acordado en la entrevista: + y − son el mismo lugar (+ si no está elegido, − si lo está); «Todas las …» limpia elegidos y ocultos; aplica a todos los filtros, incluidos Rendimiento y Empresa; «Archivadas» queda de un solo clic; en Agenda se siguen viendo solo las tareas propias.

## Contexto y objetivo

Hoy cada filtro (desplegable con buscador) admite un solo valor. Se quiere combinar varios valores y excluir otros sin perder el clic rápido de «solo este».

## Usuarios

Todos los que ven filtros. No cambia qué datos puede ver cada rol.

## Requisitos funcionales

- RF-1: CUANDO se hace clic en el nombre de un ítem del desplegable, EL SISTEMA filtra solo por ese ítem (quita los demás elegidos y ocultos de ese filtro) y cierra el desplegable.
- RF-2: EL SISTEMA muestra a la derecha de cada ítem un botón «+» (texto al pasar el mouse: «Agregar») si el ítem no está elegido, o «−» («Quitar») si lo está.
- RF-3: CUANDO se pulsa «+», EL SISTEMA suma el ítem a los elegidos (y le quita el oculto si lo tenía); con «−» lo saca de los elegidos. El desplegable queda abierto.
- RF-4: EL SISTEMA muestra al lado un botón ojo («Ocultar»). CUANDO se pulsa, el ítem queda oculto (y deja de estar elegido); en un ítem oculto el botón muestra el ojo tachado («Mostrar») y lo deja de ocultar. El desplegable queda abierto.
- RF-5: MIENTRAS haya ítems elegidos, EL SISTEMA muestra solo los resultados que cumplen al menos uno de ellos; y nunca los que cumplen algún ítem oculto (ej. Elan oculto → ninguna tarea donde Elan sea responsable, aunque tenga otros responsables).
  Ejemplo en «Estado»: ojo en «En revisión» → todas las tareas menos las que están en revisión; «+» en «En curso» y «Bloqueada» → solo esos dos estados.
- RF-6: Un ítem elegido se ve con fondo de color y un check; un ítem oculto, con el nombre tachado y en gris.
- RF-7: El botón que abre el filtro dice: el nombre del ítem si hay uno elegido; «Nombre +N» si hay varios; «Sin Nombre» (o «Sin Nombre +N») con el ojo tachado si solo hay ocultos. Si hay elegidos y ocultos, manda el texto de los elegidos. Conserva el color propio (estado, alerta) solo con un único elegido y ningún oculto.
- RF-8: CUANDO se elige «Todas las …», EL SISTEMA quita todos los elegidos y ocultos de ese filtro. El botón «Restablecer filtros» sigue limpiando todo.
- RF-9: Las opciones especiales que cambian la vista quedan de un solo clic y sin botones: «Archivadas» (Estado) y «Todos los proyectos» del resumen de proyectos.
  En el resumen de proyectos (página Proyectos, filtro «Buscar», que sin elegir nada muestra «Recientes»), «Todos los proyectos» muestra todas las tarjetas y conserva los ocultos: queda «todos menos los ocultos».
- RF-10: Aplica a todos los filtros con desplegable: Proyecto (tablero, cronograma y calendario), Panorama general, Agenda, Archivos (proyecto y todos los proyectos), Resumen de proyectos (Proyecto y Salud), Rendimiento (Proyecto) y Empresa (Cliente).
- RF-11: En Agenda se siguen viendo solo las tareas propias. El filtro «Persona» filtra esas tareas por las otras personas asignadas a ellas; quien entra no aparece en la lista. Lo ven todos los usuarios. Deja de existir «ver la agenda de otra persona».
- RF-12: En Rendimiento y Empresa, el informe suma los proyectos o clientes elegidos y deja afuera los ocultos, siempre dentro de lo que cada rol puede ver.
- RF-13: Los links que ya existen con un solo valor (ej. `?risk=overdue`, `?status=BLOCKED`, tarjetas de la Agenda, links del bot) siguen funcionando igual.

## Requisitos no funcionales

- Íconos de la app (`PlusIcon`, `EyeIcon`, `EyeOffIcon`, check) y uno nuevo «−» con el mismo trazo.
- Botones siempre visibles (no solo al pasar el mouse) para que funcionen en el celular.
- Sin textos nuevos de ayuda en pantalla; solo los textos al pasar el mouse.

## Casos límite

- Elegir y ocultar el mismo ítem es imposible: una acción reemplaza a la otra.
- Buscar en el desplegable no borra elegidos ni ocultos.
- Etiqueta de categoría completa elegida u oculta: aplica a todas sus etiquetas.
- Proyecto principal elegido en Panorama general: incluye sus subproyectos (como hoy); oculto: también los oculta.
- Agenda: «Completadas» de días pasados se muestran solo si «Completada» está entre los elegidos.
- Un valor de la URL que ya no existe (persona dada de baja) se ignora.

## Fuera de alcance

- Fechas y Buscar (no son desplegables de ítems).
- Guardar combinaciones de filtros con nombre.

## Criterios de finalización

- `tsc` y `lint` sin errores; chequeo ejecutable de la lógica de elegidos/ocultos.
- Cada pantalla de RF-10 filtra con varios elegidos y con ocultos.

## Decisiones tomadas en la entrevista

- + y − en el mismo lugar, según el estado del ítem → como pidió el usuario.
- Agenda sigue siendo personal; «Persona» filtra por quién más está en mis tareas, sin mí → pedido del usuario.
- Rendimiento y Empresa también llevan los botones → aprobado.
- Texto del botón «Alejandro +2» / «Sin Elan» → aprobado.
- «Archivadas» solo clic → aprobado.
