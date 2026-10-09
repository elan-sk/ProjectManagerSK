# Especificación 004 — Subproyectos (proyecto padre e hijos)

Estado: aprobada (implementada; falta prueba visual)

| | |
|---|---|
| Origen | Pedido por chat, 2026-10-09 |

## Pedido original

> Crea un sistema de subproyecto para agrupar en un proyecto varios, solo aceptamos hasta dos niveles proyecto padre y el hijo […] en la vista mis proyectos en la agenda sería el proyecto padre y el logo sería el principal y al lado el grupito de los proyectos hijo (como cuando en asignados hay varias personas). En cuanto a los PM, un proyecto hijo puede tener PM diferente al del PM principal, pero el PM del proyecto principal tiene acceso a los proyectos hijos pero al contrario no, un PM hijo no a los demás. En los buscadores y los proyectos debe aparecer siempre primero icono del padre y luego el icono propio. Para los proyectos padres en definición vas a colocar las opciones propias para agregar y administrar los proyectos hijo, pero no quiero que lo recargue con cosas innecesarias, los proyectos individuales van a seguir teniendo buena autonomía, analiza también qué funciones se pueden adaptar en las otras vistas de Gantt y calendario. En cuanto a los archivos del padre verá todos los archivos pero estos tendrán el indicador icono de su proyecto y también agregas un filtro nuevo solo para proyectos padres, el de proyectos, que incluye sus proyectos hijos. En el panorama reemplaza el filtro de buscar por el de proyectos (no importa porque ya hay un buscador general), aclaro que el filtro de cada proyecto lo dejas igual, ese reemplazo solo aplicaría para vista general.

En la entrevista se cambió la idea inicial de mostrar a los hijos como cards: el padre funciona como un «panorama» de su grupo (ver Decisiones).

## Fuentes
- Pedido por chat y tres rondas de entrevista (esta conversación).
- `MEMORY.md` del repo y memoria de Claude: proyectos ocultos (solo admin que es PM), proyectos ocultos en vistas generales (`hiddenProjectsPref`), archivado como historial, «Mis proyectos» de Agenda, reglas de textos.
- Código leído: página del proyecto, Panorama de Proyectos, Agenda, permisos (`canSeeProject`, `getProjectAdmin`), resúmenes de proyecto, buscador, ícono de proyecto, cascada Objetivo ← Requerimiento ← Fase ← Tarea.

## Contexto y objetivo
Hoy cada proyecto es independiente. Hay trabajos grandes (por ejemplo un «ecosistema digital» con app, web y tienda) que se llevan como varios proyectos con PM y cronograma propios, pero no hay forma de verlos juntos ni de que un PM principal los supervise. Se agrega un nivel de agrupación: un **proyecto padre** con **proyectos hijos**. Cada hijo sigue siendo un proyecto completo y autónomo; el padre suma la vista del grupo.

Se nota que funcionó cuando el PM principal abre el padre y ve en un solo lugar las tareas, el cronograma, el calendario, los archivos y el avance de todo el grupo, sin perder la vista individual de cada hijo.

## Usuarios
- **PM del padre**: administra el padre y todos sus hijos (mismo control que tiene hoy sobre un proyecto propio).
- **PM de un hijo**: administra solo su hijo; no el padre ni los otros hijos.
- **Administrador**: como hoy, todo.
- **Miembros** (asignados/revisores): ven lo que ya ven hoy; en el padre, las tareas del grupo.

## Definiciones
- **Padre**: proyecto que tiene al menos un hijo. **Hijo**: proyecto con un padre asignado. **Independiente**: ni padre ni hijo.
- **Grupo**: el padre más sus hijos.
- **Doble ícono**: ícono del padre seguido del ícono del hijo, para identificar un hijo.

## Historias de usuario
- HU-1. Como PM principal, quiero agrupar varios proyectos bajo uno, para supervisarlos juntos.
- HU-2. Como PM principal, quiero ver en el padre el tablero, Gantt, calendario y archivos de todo el grupo, para detectar atrasos y choques.
- HU-3. Como PM de un hijo, quiero seguir manejando mi proyecto con autonomía, sin que el padre me cambie cómo trabajo.
- HU-4. Como miembro del equipo, quiero reconocer a qué grupo pertenece un proyecto donde lo vea, para no confundirlo.
- HU-5. Como PM principal, quiero ligar los objetivos de los hijos a los objetivos del padre, para ver el avance del grupo en la Definición.

## Requisitos funcionales (EARS)

### Estructura
- RF-1: EL SISTEMA permite que un proyecto tenga como máximo un padre, y solo dos niveles: un hijo no puede tener hijos, un padre no puede ser hijo de otro y un proyecto no puede ser padre de sí mismo.
- RF-2: SI se intenta romper la regla de RF-1 (por la app o por la API), ENTONCES EL SISTEMA lo rechaza con un mensaje en lenguaje simple (ej. «Un subproyecto no puede tener subproyectos propios.») y no guarda nada.
- RF-3: EL SISTEMA mantiene a cada hijo como un proyecto completo: su página, pestañas, tareas, fases, Definición, PM, fechas, link compartido, grupo de WhatsApp y avisos funcionan igual que hoy.
- RF-4: EL SISTEMA permite que el padre tenga fases y tareas propias, no ligadas a ningún hijo.

### Permisos
- RF-5: EL SISTEMA da al PM del padre, sobre cada hijo, el mismo control que tiene el PM de ese hijo: editar, administrar tareas, cambiar fechas y PM, archivar, etc. (el que da hoy `getProjectAdmin`).
- RF-6: EL SISTEMA no le da al PM de un hijo ningún control sobre el padre ni sobre los otros hijos del grupo.
- RF-7: EL SISTEMA, en las listas acotadas a «proyectos que administro» (Panorama general de un PM, «Mis proyectos» de Agenda, buscador del encabezado, Agenda de otra persona para un PM), trata los hijos de un padre como administrados por el PM del padre.
- RF-8: MIENTRAS un hijo esté oculto, EL SISTEMA lo deja ver solo al administrador que sea PM del hijo o del padre (extiende la regla actual de proyectos ocultos).

### Administrar el grupo (Definición del padre)
- RF-9: EL SISTEMA muestra en la pestaña Definición de un padre o independiente un bloque compacto «Subproyectos», con una fila por hijo (ícono del hijo, nombre, PM y avance) que lleva a la página del hijo. En un independiente sin hijos el bloque se reduce a sus botones, sin lista vacía ni texto de relleno. En un hijo, el bloque no aparece y en su lugar se ve «Subproyecto de <padre>» con link al padre.
- RF-10: CUANDO quien administra el proyecto elige «+ Nuevo subproyecto», EL SISTEMA abre el mismo formulario de Nuevo proyecto y crea el proyecto ya ligado como hijo.
- RF-11: CUANDO quien administra el proyecto elige «Vincular existente», EL SISTEMA ofrece solo proyectos activos (no archivados ni eliminados) que esa persona también administra, que no son padres ni hijos, y distintos del propio; al elegir uno queda ligado como hijo.
- RF-12: CUANDO quien administra el padre elige «Quitar del grupo» en una fila (con confirmación propia de la app), EL SISTEMA desliga el hijo, que vuelve a ser independiente sin perder nada (tareas, archivos, objetivos); los objetivos del hijo ligados a objetivos del padre quedan sin ligar.
- RF-13: EL SISTEMA muestra los botones de RF-10 a RF-12 solo al PM del padre (o del proyecto que va a ser padre) y al administrador.

### Definición en cascada
- RF-14: CUANDO se crea o edita un objetivo de un hijo, EL SISTEMA permite elegir opcionalmente «Contribuye a» un objetivo del padre.
- RF-15: EL SISTEMA calcula el avance de un objetivo del padre como el promedio entre sus requerimientos propios y los objetivos de hijos ligados a él (cada uno con su propio avance en cascada), y en la Definición del padre lista debajo de cada objetivo los objetivos de hijos que aportan, con el ícono del hijo.
- RF-16: EL SISTEMA no mezcla el resto de la Definición: la descripción, requerimientos y fases de cada hijo siguen viéndose solo en el hijo.

### Vistas del padre (panorama del grupo)
- RF-17: EL SISTEMA muestra en el Tablero, el Gantt y el Calendario de un padre las tareas del padre y de todos sus hijos visibles para esa persona, cada una con el ícono de su proyecto; los mismos filtros de siempre (Persona, Estado, Tipo, Etiqueta, Alerta, Fechas) aplican a todas.
- RF-18: EL SISTEMA, en Tablero, Gantt y Calendario de un padre, reemplaza el filtro «Buscar» por un filtro «Proyecto» con las opciones «Todos los proyectos» (por defecto), el padre y cada hijo. En proyectos independientes y en los hijos, el filtro «Buscar» se queda como está.
- RF-19: EL SISTEMA agrupa el Gantt del padre por proyecto: primero el padre con sus fases y tareas, luego cada hijo con un encabezado (ícono, nombre y barra resumen desde la primera hasta la última fecha de sus tareas, con su % de avance) y debajo sus fases y tareas.
- RF-20: EL SISTEMA, en las vistas del padre, decide para cada tarea si se puede mover, editar o asignar según el proyecto al que pertenece (el PM de un hijo que mira el padre solo administra las tareas de su hijo).
- RF-21: EL SISTEMA crea las tareas nuevas desde el padre solo en el padre (con sus fases); las de un hijo se crean desde el hijo.
- RF-22: EL SISTEMA muestra en la pestaña Archivos de un padre los archivos, links, contraseñas visibles y links compartidos del padre y de sus hijos, cada ficha con el ícono de su proyecto, y agrega un filtro «Proyecto» (Todos / el padre / cada hijo) junto a los filtros actuales; el buscador de archivos se mantiene. Ese filtro no aparece en independientes ni en hijos.
- RF-23: EL SISTEMA, en el encabezado del padre, calcula avance (completadas / total), alertas (inicio retrasado, por vencer, final retrasado), salud y cuellos de botella sumando las tareas del padre y de sus hijos; el retraso u holgura proyectado es el peor del grupo. En el encabezado de un hijo, sus números son solo suyos.

### Listas e íconos
- RF-24: EL SISTEMA, en «Mis proyectos» de Agenda, muestra un padre en una sola fila con su logo y al lado el grupito superpuesto de logos de sus hijos (como los asignados), con los números del grupo (RF-23); los hijos no aparecen en filas aparte. Si la persona administra un hijo pero no su padre, el hijo aparece en su propia fila con doble ícono.
- RF-25: EL SISTEMA, en la Vista resumen de Proyectos, aplica la misma regla de RF-24: una tarjeta por padre con grupito de logos y números del grupo; el hijo aparece suelto con doble ícono solo si la persona lo ve pero no ve a su padre. El filtro «Buscar» de esa Vista resumen sigue igual y, al elegir un hijo, muestra su tarjeta.
- RF-26: EL SISTEMA muestra el doble ícono (padre y luego el propio) en todo lugar donde aparece el ícono de un hijo: encabezado del proyecto y de sus tareas, resultados del buscador del encabezado (proyecto, tarea y archivos), fichas de tareas en Tablero, Gantt y Calendario, fichas de Archivos, Vista resumen, Mis proyectos, filtro de proyectos, colisiones, Rendimiento, widget del chat. La vista del link compartido del cliente de un hijo muestra solo el ícono propio (no se le revela el padre al cliente).
- RF-27: EL SISTEMA, en el Panorama general de Proyectos (no en la página de cada proyecto), reemplaza el filtro «Buscar» por un filtro «Proyecto»: lista los proyectos visibles con los hijos debajo de su padre (doble ícono o «Padre › Hijo»); elegir un padre muestra el padre y todos sus hijos; elegir un hijo, solo ese hijo. La pestaña Archivos del Panorama general mantiene su filtro de proyecto actual con la misma regla de inclusión.

### Archivar, ocultar, eliminar
- RF-28: CUANDO se archiva, desarchiva, oculta, muestra o elimina un padre, EL SISTEMA aplica lo mismo a sus hijos, y la confirmación avisa antes cuántos subproyectos se afectan (ej. «También se archivarán sus 3 subproyectos.»).
- RF-29: EL SISTEMA permite archivar, ocultar o eliminar un hijo por separado sin tocar al padre; en ese caso el hijo sale de las vistas del padre igual que sale hoy de las vistas generales (los ocultos se ven en el padre solo para quien puede verlos).

### Integraciones
- RF-30: EL SISTEMA expone en la API el padre de un proyecto y la lista de sus hijos, y permite fijar o quitar el padre con los mismos permisos y reglas de RF-1, RF-2, RF-11 y RF-13.
- RF-31: EL SISTEMA, en el chat (bot), indica «(subproyecto de <padre>)» al nombrar o describir un hijo y lista los hijos al describir un padre.
- RF-32: EL SISTEMA no cambia a quién llegan los avisos (campana, WhatsApp, resumen diario, recordatorios, cola de alertas): siguen yendo al PM del proyecto de la tarea y a sus asignados/revisores; el PM del padre no recibe los de los hijos.
- RF-33: EL SISTEMA mantiene el link compartido del cliente de un padre mostrando solo el padre; cada hijo tiene su propio link.

## Requisitos no funcionales
- Los proyectos existentes quedan todos independientes tras la actualización; nada cambia para ellos hasta que alguien arme un grupo.
- Textos en tercera persona o impersonales, sin jerga técnica; confirmaciones con la confirmación propia de la app.
- Ningún error bloquea la página: un fallo al vincular o desvincular se muestra en lenguaje simple.
- La página de un padre con 5 hijos de ~60 tareas cada uno carga sin un cambio notorio frente a un proyecto independiente de ~300 tareas (mismas consultas, sin una consulta por tarea).

## Casos límite
- Un padre al que le quitan su último hijo vuelve a ser independiente (desaparece el filtro «Proyecto» y vuelve «Buscar»).
- Un hijo archivado u oculto no cuenta en los totales del padre para quien no lo ve; los totales del padre solo suman hijos activos y visibles.
- Un hijo cuyo padre fue eliminado o archivado: imposible por RF-28 (se aplica en cascada).
- Vincular como hijo a un proyecto que es padre o hijo: rechazado (RF-2).
- Un miembro asignado solo en un hijo abre el padre: ve las tareas del grupo, como hoy ve cualquier proyecto no oculto, sin poder administrar nada.
- Un objetivo del padre borrado: los objetivos de hijos ligados quedan sin ligar.
- Móvil: el grupito de logos y el doble ícono no rompen las filas angostas (los nombres se recortan como hoy).

## Fuera de alcance
- Mostrar a los hijos como cards dentro del padre (descartado en la entrevista).
- Más de dos niveles.
- Dependencias entre tareas de proyectos distintos del grupo.
- Avisos al PM del padre por tareas de los hijos (RF-32).
- Link compartido del padre con las tareas de los hijos (RF-33).
- Rendimiento agregado del grupo (la página de Rendimiento de un padre sigue mostrando solo el padre; solo cambia el ícono, RF-26).
- Mover tareas de un proyecto a otro del grupo.

## Criterios de finalización
- Todos los RF verificados (chequeo ejecutable, tsc, lint o lectura de código) y lo visual listado como pendiente de prueba en navegador si no se autoriza.
- Chequeo `npm run verify:subprojects` que cubre reglas de dos niveles, permisos del PM padre/hijo e inclusión de hijos en filtros y totales.
- `npx tsc --noEmit`, `npm run lint` y los `verify:*` existentes en verde.
- Inventario de impacto del plan revisado consumidor por consumidor.

## Decisiones tomadas en la entrevista
- ¿Hijos como cards en el padre? → No. El padre es un panorama del grupo con sus propias funciones (el usuario lo replanteó).
- ¿El padre tiene tareas propias? → Sí, sin ligarse a las de los hijos.
- ¿Cómo se liga la Definición? → Objetivo del hijo → «Contribuye a» un objetivo del padre; el resto de la Definición queda en cada hijo (autonomía, una sola capa nueva).
- ¿Totales del padre? → Suman padre + hijos; dentro del hijo, solo sus números.
- ¿Filtro «Proyecto» en el padre? → Reemplaza al «Buscar» de tareas en Tablero/Gantt/Calendario; en Archivos se agrega junto a los demás.
- ¿Gantt del padre? → Agrupado por proyecto con barra resumen por hijo.
- ¿Vista resumen y Mis proyectos? → Solo el padre con grupito de logos; un hijo suelto solo si no se ve a su padre.
- ¿Bloque Subproyectos? → Crear, vincular existente y quitar del grupo; solo PM del padre o admin (y para vincular, administrar también el otro proyecto).
- ¿Archivar/ocultar/eliminar el padre? → En cascada a los hijos, avisando cuántos.
- ¿Avisos al PM padre? → No, solo acceso.
- ¿API, bot, link compartido? → API y bot informan la relación; el link compartido queda igual.

## Dudas abiertas
(ninguna)
