# Especificación 003 — Retraso / holgura proyectados del proyecto

Estado: implementada

| | |
|---|---|
| Origen | Pedido por chat, 2026-10-06 |

## Pedido original
> quiero que crees un nuevo indicador nuevo, es dias de retraso que es para los proyectos, es decir es uno que me indique de seguir el ritmo actual con los dias … cuantos dias despues de fin estipulado … si son más del tiempo del fin seria retraso (malo) si gane tiempo y termino antes seria algo positivo y se mostraria como holgura, esto lo tuvimos antes pero no lo supiste hacer … (pista, debes enfocarte en la ruta critica) … se mostraria en la vista resumen del proyecto y dentro del proyecto, en la vista de todos los proyectos agrega un filtro para mostrar los proyectos retrasados y con holgura, tambien en agenda en la vista de los proyectos … el bot tambien debe poder ver esa informacion … redondear cuando sean muchos dias ej 1 semana 1 mes … tambien integrarlo en los mensajes de WA

Además, en el mismo pedido: Configuración en dos columnas (aprobado, ya hecho) y la vista de Archivos en dos columnas en pantalla grande.

## Fuentes
- Conversación del chat (pedido y tres rondas de preguntas).
- Código actual: `getProjectCompletionVariance` (delays.ts) toma la fecha planeada más tardía; las tareas abiertas vencidas no corren su fecha ni la de sus sucesoras (solo se corren al completarse una predecesora), por eso el indicador actual dice «a tiempo» con tareas vencidas en la ruta crítica.

## Contexto y objetivo
Saber, si el proyecto sigue al ritmo actual, cuándo terminaría de verdad y cuánto se aleja del cierre comprometido.

## Definiciones
- **Hoy**: día calendario de Colombia según el servidor.
- **Duración** de una tarea: sus días hábiles planeados (inicio a fin, incluidos ambos).
- **Fin proyectado de una tarea**:
  - Completada → su fecha real de fin.
  - En curso, Bloqueada o Devuelta, y su fin planeado ya pasó → hoy + su duración (días hábiles).
  - Sin iniciar y su inicio planeado ya pasó → arranca hoy: hoy + su duración − 1 (una tarea de 1 día empieza y termina el mismo día, convención del cronograma).
  - Cualquier otro caso → su fin planeado.
- **Corrimiento en cadena**: si el fin proyectado de una tarea se corre, sus sucesoras se corren igual que en el cronograma (fin a inicio: arranca el día hábil siguiente; inicio a inicio: arranca junto con ella), manteniendo su duración. Solo se corre lo que depende de una tarea atrasada (la ruta que define el fin).
- **Fin proyectado del proyecto**: el más tardío de todas sus tareas.
- **Retraso / holgura**: días hábiles entre el fin proyectado y la fecha de cierre comprometida. Después = retraso (rojo); antes = holgura (verde); igual = «A tiempo».
- **Redondeo**: menos de 5 días hábiles → «N días»; de 5 a 19 → semanas (5 hábiles = 1 semana); 20 o más → meses (20 hábiles = 1 mes), con medio punto («1,5 meses»). El número exacto en días hábiles queda en el tooltip.

## Requisitos funcionales (EARS)
- RF-1: EL SISTEMA calcula el fin proyectado de cada proyecto según las Definiciones, sin modificar ninguna fecha guardada.
- RF-2: SI el proyecto no tiene fecha de cierre comprometida, ENTONCES EL SISTEMA no muestra el indicador de proyecto (en ninguna vista, ni en WhatsApp ni en el bot).
- RF-3: EL SISTEMA muestra el indicador redondeado («2 semanas de retraso», «3 días de holgura», «A tiempo») en la tarjeta resumen de cada proyecto (Proyectos y Archivados) y en el resumen dentro del proyecto, con el número exacto en el tooltip. Reemplaza al indicador viejo «Nd retraso / +Nd holgura».
- RF-4: En Definición, cada Fase, Objetivo y Requerimiento muestra su retraso proyectado con el mismo método: fin proyectado de sus tareas contra su fin planeado. Como su fin planeado ya incluye lo que se ganó o perdió al completar tareas, a ese nivel solo puede salir retraso (o nada); la holgura se ve a nivel proyecto. Reemplaza al indicador viejo de esos niveles.
- ~~RF-5: En la lista de proyectos, un filtro «Cronograma» con opciones Todos · Retrasados · Con holgura · A tiempo, que se combina con los filtros existentes; los proyectos sin fecha de cierre solo aparecen en «Todos».~~ (retirado 2026-10-06: lo cubre el filtro de salud)
- RF-6: En la Agenda, en la sección de proyectos, cada proyecto muestra el indicador.
- RF-7: El bot (consulta de estado de proyecto) devuelve el fin proyectado, el retraso/holgura en días hábiles y su texto redondeado, y la(s) tarea(s) que más empujan el fin, para responder preguntas.
- RF-8: El resumen diario de WhatsApp de PM y administradores agrega en cada proyecto una línea «Cronograma · …» (PM: sus proyectos; admin: todos los visibles). Sin fecha de cierre, la línea no va.
- RF-9: Las alertas agrupadas que van al grupo de WhatsApp agregan en cada proyecto una línea «Cronograma · …» (si tiene fecha de cierre).
- RF-10: La API de detalle de proyecto devuelve los mismos datos que RF-7 (la usa Claude por la skill).
- RF-11: Vista de Archivos (del proyecto y de todos los proyectos), en pantalla grande: Imágenes a la izquierda y Documentos + Enlaces a la derecha; en pantallas chicas, apiladas como hoy.

## Requisitos no funcionales
- Un único cálculo compartido (una sola fuente de verdad) usado por todas las vistas, el bot, la API y WhatsApp.
- Textos impersonales, sin jerga técnica.

## Casos límite
- Proyecto sin tareas → sin indicador.
- Todas las tareas completadas → fin proyectado = fin real; el indicador muestra el resultado final.
- Hoy es fin de semana o festivo → «hoy + duración» cuenta solo días hábiles.
- Dependencias circulares (no debería haber) → se cortan sin colgar el cálculo.
- Tarea vencida sin sucesoras y fuera de la ruta crítica → igual cuenta si su fin proyectado pasa a ser el más tardío.

## Fuera de alcance
- Cambiar fechas del cronograma, el Gantt o las alertas de tarea existentes.
- Avisos nuevos de WhatsApp disparados por el indicador (solo se agrega a los mensajes existentes).
- Holgura por tarea (openSlackDays) y cuellos de botella: no cambian.

## Criterios de finalización
- Todos los RF en ✅, `tsc`, `lint`, build de producción y un chequeo ejecutable del cálculo (casos: a tiempo, tarea crítica vencida, tarea no crítica vencida absorbida, sin iniciar atrasada, redondeo).

## Decisiones tomadas en la entrevista
- En curso dentro de lo planeado → fin planeado; vencida → hoy + su duración (pedido del usuario).
- Sin iniciar con inicio pasado → arranca hoy + su duración; Bloqueada y Devuelta como «en curso».
- Sin fecha de cierre → no se muestra.
- Redondeo días → semanas → meses.
- WhatsApp: resumen diario de PM y admin (PM los suyos, admin todos) y alertas al grupo, una línea por proyecto.
- Fase/Objetivo/Requerimiento: mismo cálculo nuevo.
- Archivos: secciones lado a lado.

## Cambios
- 2026-10-06 — La salud y el cronograma van en un solo badge («Muy retrasado · 1 semana de retraso», rojo si hay retraso) en tarjetas, proyecto y Agenda; en el resumen diario de WhatsApp, una sola línea «Salud · 😡 Muy retrasado · 🔴 1 semana de retraso». Las alertas al grupo siguen con su línea «Cronograma» (pedido del usuario).
- 2026-10-06 — Reemplaza el cambio anterior: «Muy retrasado · A tiempo» confundía (salud = % de tareas vencidas; cronograma = llegada al cierre). Ahora un solo estado: con fecha de cierre manda el cronograma («Retrasado 1 semana», «A tiempo», «Holgura de 2 meses»); sin ella, la salud. Se quita el filtro «Cronograma» (RF-5 retirado) y el filtro de salud filtra por ese estado (Bien / Normal / Retrasado). WhatsApp: «Estado · 😡 Retrasado 1 semana» en el resumen y «⏳ Cierre · …» en las alertas al grupo (pedido del usuario).
- 2026-10-06 — WhatsApp: «Estado» va primero en cada proyecto del resumen y las alertas al grupo dicen «⏳ Estado · …» (misma palabra). Archivos: con dos o más tipos siempre en dos columnas (sin imágenes, el primer tipo a la izquierda) — Racafé/Editec, con links y documentos, quedaban apilados.

## Dudas abiertas
(ninguna)
