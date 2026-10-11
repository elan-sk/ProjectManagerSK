# Especificación 006 — La fase sale de la cascada de definición

Estado: implementada

| | |
|---|---|
| Origen | Pedido por chat, 2026-10-11 |

## Pedido original

> «fase es como una forma de agrupar tareas en el tiempo, no es algo relevante porque las tareas responderían a su requerimiento más que todo»
>
> «no debe estar en la cascada, es más una forma de organizar las tareas en el tiempo que un elemento de los objetivos»

Acordado en la conversación:

- La cascada de definición pasa a ser Objetivo → Requerimiento → Tarea.
- La fase queda como agrupador de tiempo de las tareas, por fuera de la cascada.
- Uno o varios requerimientos por tarea, opcional (cambiado el 2026-10-11; antes uno solo).
- La actualización se ensaya en local con una copia de producción. La base local no se sube a producción.
- El retiro definitivo del vínculo Requerimiento–Fase se hace después, en un despliegue aparte.

## Fuentes

- Conversación del 2026-10-11 — decisiones de modelo, visualización y plan de migración.
- `docs/constitution.md` — principios 1, 3, 4, 6 y 7.
- Código de la cascada actual (cálculo de avance, pestaña Definición, vista del cliente, API, bot).
- Conteo en la base local: 5 requerimientos, 24 fases, 71 tareas; ninguna fase con más de un requerimiento.
- Copia de producción — pendiente; la exporta el usuario.
- Biblioteca de Depura — no se consultó: el pedido es interno de esta aplicación.

## Contexto y objetivo

Hoy la tarea llega a su requerimiento a través de la fase. El avance de un requerimiento es el promedio de las fases enteras a las que está vinculado, así que dos requerimientos que comparten fase muestran el mismo porcentaje y las mismas tareas atrasadas aunque el trabajo sea de uno solo.

El objetivo es que cada tarea responda directamente a su requerimiento y que el avance del requerimiento salga de sus propias tareas. Funcionó si dos requerimientos que comparten fase muestran avances distintos según sus tareas, y ningún proyecto existente pierde su avance al actualizar.

## Usuarios

- **PM y administrador:** asignan requerimientos a las tareas y leen el avance.
- **Miembro:** ve el requerimiento de sus tareas; no lo cambia.
- **Cliente (link compartido):** ve el avance de requerimientos y fases.
- **Asistente por API y bot:** leen y asignan el requerimiento de una tarea.

## Historias de usuario

- HU-1. Como PM, quiero indicar a qué requerimiento responde cada tarea para que el avance del requerimiento sea real.
- HU-2. Como PM, quiero asignar muchas tareas a un requerimiento de una vez para no abrirlas una por una.
- HU-3. Como PM, quiero ver separado el avance del alcance y el del cronograma para no confundir qué se cumplió con cuándo se hace.
- HU-4. Como PM, quiero saber qué tareas no responden a ningún requerimiento para decidir si les falta uno.
- HU-5. Como cliente, quiero ver el avance de cada requerimiento según su trabajo real.

## Definiciones

- **Tarea vinculada:** tarea que tiene un requerimiento asignado.
- **Tarea sin requerimiento:** tarea que no tiene ninguno. Es un estado válido (reuniones, despliegues).
- **Cálculo de respaldo:** el cálculo actual por fases, que se conserva para requerimientos que todavía no tienen ninguna tarea vinculada.
- **Quien administra el proyecto:** su PM o un administrador, los mismos que hoy editan la Definición.

## Requisitos funcionales (EARS)

### Datos y actualización

- RF-1: EL SISTEMA permite que cada tarea responda a ninguno, uno o varios requerimientos, todos del mismo proyecto que la tarea.
- RF-2: CUANDO se aplica la actualización, EL SISTEMA vincula cada tarea a todos los requerimientos de su fase; las tareas de fases sin requerimiento quedan sin requerimiento.
- RF-3: CUANDO se aplica la actualización, EL SISTEMA conserva sin cambios los vínculos Requerimiento–Fase existentes y todos los demás datos.

### Cálculo de avance

- RF-4: MIENTRAS un requerimiento tenga al menos una tarea vinculada, EL SISTEMA calcula su avance como tareas completadas sobre tareas vinculadas, y toma de esas mismas tareas su riesgo, sus tareas atrasadas, su holgura y su retraso proyectado; una tarea que responde a varios requerimientos cuenta en cada uno.
- RF-5: MIENTRAS un requerimiento no tenga ninguna tarea vinculada, EL SISTEMA lo calcula con sus fases como hoy; sin fases ni tareas, su avance es 0 %.
- RF-6: EL SISTEMA calcula el avance de un objetivo como el promedio de sus requerimientos y de los objetivos de subproyectos que le aportan, igual que hoy.
- RF-7: EL SISTEMA ordena los requerimientos por el inicio más temprano de sus tareas vinculadas; en cálculo de respaldo, por el de sus fases.
- RF-8: EL SISTEMA calcula el avance de una fase con todas sus tareas, igual que hoy.

### Asignar el requerimiento

- RF-9: CUANDO se crea una tarea, EL SISTEMA ofrece un campo opcional «Requerimientos» con buscador, que permite elegir varios entre los del proyecto.
- RF-10: EL SISTEMA muestra en el detalle de la tarea sus requerimientos o «Sin requerimiento», y quien administra el proyecto puede agregar o quitar requerimientos desde ahí.
- RF-11: SI la persona no administra el proyecto, ENTONCES EL SISTEMA muestra los requerimientos de la tarea solo para lectura.
- RF-12: CUANDO quien administra el proyecto abre «Tareas» en un requerimiento, EL SISTEMA muestra las tareas del proyecto agrupadas por fase, con buscador, una casilla por tarea y una opción para marcar toda la fase; al guardar, las marcadas responden a ese requerimiento y las desmarcadas dejan de responder a él, sin cambiar sus otros requerimientos.
- RF-13: MIENTRAS una tarea de esa lista responda también a otros requerimientos, EL SISTEMA muestra cuáles.
- RF-14: SI se intenta asignar a una tarea un requerimiento de otro proyecto, ENTONCES EL SISTEMA rechaza el cambio con un mensaje en lenguaje simple.
- RF-15: CUANDO se duplica una tarea o se inserta una junto a otra, EL SISTEMA le asigna a la nueva los requerimientos de la tarea de origen; al unir tareas, la resultante reúne los de todas.
- RF-16: CUANDO se elimina un requerimiento, EL SISTEMA hace que sus tareas dejen de responder a él, conserva sus demás requerimientos y no elimina ninguna tarea.
- RF-17: CUANDO se cambia la fase de una tarea, EL SISTEMA conserva sus requerimientos.

### Pestaña Definición

- RF-18: EL SISTEMA muestra el Resumen de avance en dos bloques rotulados: «Alcance» (objetivos y requerimientos) y «Cronograma» (fases); los subproyectos siguen como grupo aparte.
- RF-19: MIENTRAS el proyecto tenga al menos un requerimiento y alguna tarea que no responda a ninguno, EL SISTEMA muestra en el Resumen cuántas son y permite abrir su lista, agrupada por fase y con enlace a cada tarea.
- RF-20: EL SISTEMA acomoda el Resumen así: en escritorio, Alcance y Cronograma en una fila con una línea divisoria; en tablet, Alcance arriba en dos columnas y Cronograma abajo; en móvil, todo apilado.
- RF-21: EL SISTEMA muestra en cada requerimiento sus tareas vinculadas agrupadas por fase, con el estado de cada una; en cálculo de respaldo muestra sus fases como hoy.
- RF-22: EL SISTEMA muestra en cada fase solo sus tareas, sin referencia a requerimientos; el formulario de la fase ya no permite elegir requerimientos.

### Link del cliente

- RF-23: EL SISTEMA muestra al cliente los requerimientos con su avance y, en un bloque aparte, las fases con los títulos de sus tareas; no lista tareas bajo cada requerimiento.

### API, bot y asistentes

- RF-24: CUANDO se consulta una tarea por la API, EL SISTEMA devuelve sus requerimientos con los objetivos a los que responde cada uno; al crear o editar una tarea acepta una lista opcional de requerimientos, que reemplaza la anterior.
- RF-25: EL SISTEMA sigue aceptando y devolviendo por la API los vínculos Requerimiento–Fase, para no romper lo que ya los usa.
- RF-26: CUANDO el bot crea o edita una tarea, EL SISTEMA le permite indicar uno o varios requerimientos, y el bot informa los requerimientos de una tarea cuando se le consulta.
- RF-27: EL SISTEMA deja documentada la cascada nueva en las guías de los asistentes (`pmsk`, `sdd` y `project-manager-sk`), en el proyecto y en su respaldo global.

### Errores

- RF-28: SI falla guardar una asignación, ENTONCES EL SISTEMA lo informa en lenguaje simple y la pantalla sigue utilizable, sin cambios a medias.

## Requisitos no funcionales

- La actualización solo agrega: no elimina tablas, columnas ni filas.
- La actualización corre dentro del proceso de compilación del despliegue, sin pasos manuales en el servidor.
- Aplicada sobre una copia reciente de producción, termina sin errores y sin perder registros.
- Textos en tercera persona o impersonal, sin jerga técnica.
- Lista de requerimientos con buscador, no con píldoras, porque es una lista que crece.
- Permisos resueltos con los helpers centralizados existentes.

## Casos límite

- Proyecto sin requerimientos: no se muestra el aviso de tareas sin requerimiento ni el campo ofrece opciones.
- Requerimiento cuya fase no tiene tareas: queda en cálculo de respaldo, con 0 %, hasta que se le asigne la primera tarea.
- Los vínculos Requerimiento–Fase antiguos dejan de poder editarse desde las pantallas; solo sirven al cálculo de respaldo.
- Subproyectos: una tarea del subproyecto solo admite requerimientos del subproyecto.
- Tarea archivada: cuenta en el avance de su requerimiento con el mismo criterio con que hoy cuenta en el de su fase.
- Dos personas cambian a la vez los requerimientos de la misma tarea: queda la última lista guardada.
- Proyecto con muchas tareas: la lista de asignación se recorre con buscador y desplazamiento propio, sin salirse de la pantalla.

## Fuera de alcance

- Eliminar el vínculo Requerimiento–Fase, el cálculo de respaldo y los campos antiguos de la API. Va en una especificación posterior.
- Filtrar o agrupar por requerimiento en Kanban, Gantt y Calendario.
- Requerimiento en la importación de cronogramas por archivo: las tareas importadas entran sin requerimiento.
- Avisos de WhatsApp, notificaciones y resúmenes: no mencionan requerimientos y no cambian.
- Subir la base local a producción.

## Criterios de finalización

- Todos los RF verificados.
- `npx tsc --noEmit`, `npm run lint` y los `verify:*` del área en verde, con un chequeo ejecutable nuevo para el cálculo y otro para la regla de traspaso.
- Ensayo general: sobre una copia fresca de producción, la actualización corre como en el despliegue y un informe compara el avance de cada requerimiento antes y después.
- Inventario de impacto repasado consumidor por consumidor.
- Respaldo de producción tomado justo antes del despliegue.

## Decisiones tomadas en la entrevista

- ¿Uno o varios requerimientos por tarea? → Primero uno; cambiado a varios el 2026-10-11: en un proyecto real una tarea puede servir a varios requerimientos.
- ¿Qué pasa al migrar con las tareas de fases con varios requerimientos? → Heredan todos los de su fase: los porcentajes quedan idénticos y ningún requerimiento arranca sin tareas; después se depura a mano.
- ¿Las fases siguen en el Resumen? → Sí, como bloque «Cronograma» separado de «Alcance».
- ¿Cómo se asignan muchas tareas? → Desde el requerimiento, con lista por fase y «marcar toda la fase», además del campo en cada tarea.
- ¿Qué ve el cliente? → Lo mismo que hoy en dos bloques; solo cambian los porcentajes.
- ¿Cómo se acomoda el Resumen por tamaño? → Una fila en escritorio, dos niveles en tablet, apilado en móvil.
- ¿La copia de una tarea hereda el requerimiento? → Sí, igual que hereda la fase.
- ¿Subir la base local a producción? → No; la actualización viaja con el despliegue y se ensaya en local.
- Asumido por convención: eliminar un requerimiento deja sus tareas sin requerimiento; cambiar de fase no cambia el requerimiento.
- ¿Quién asigna el requerimiento? → El PM del proyecto o un administrador. Al leer el código se vio que la fase de una tarea también la puede cambiar su asignado; el requerimiento es parte de la Definición, que solo editan PM y administrador, así que no se extiende al asignado.

## Cambios

- 2026-10-11 — RF-22 modificado: la fase ya no muestra a qué requerimientos responden sus tareas. La cascada se lee solo hacia abajo: objetivo → requerimientos → fases con sus tareas (pedido del usuario al ver la pantalla).

- 2026-10-11 — Una tarea puede responder a varios requerimientos (pedido del usuario). Cambian RF-1, 2, 4, 9 a 17, 19, 24 y 26; se retira de «Fuera de alcance» el punto de varios requerimientos por tarea. El traspaso vincula cada tarea a todos los requerimientos de su fase.

## Dudas abiertas

Ninguna.
