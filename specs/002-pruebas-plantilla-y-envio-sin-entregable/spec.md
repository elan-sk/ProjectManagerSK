# Especificación 002 — Pruebas: plantilla asignable y envío a revisión sin entregable

Estado: implementada

| | |
|---|---|
| Origen | Pedido por chat, 2026-10-06 |

## Pedido original
> quiero que cambies un poco el flujo de las tareas de prueba, quiero que al crear la tarea de ese tipo se pueda elegir la plantilla y que no sea obligatoria cagar un link o evidencia para mandar la revision. por que lo quiero asi y poder hacer que tu a l crear la tareas o cuando estes procesando con sdd puedas crear la plantilla y asignarla antes de pasar a la fase de revision

Acordado en la entrevista: el link/archivo que se pide es solo para *disparar* la revisión (muchas veces es un repo o documento que el revisor ya conoce). Aplica al envío y a los reenvíos. Lo de cada prueba en particular no cambia.

## Fuentes
- Conversación del chat (pedido y respuestas de la entrevista).
- Código actual: el formulario de nueva tarea y la API ya permiten elegir la plantilla al crear una Prueba; la API ya permite cambiarla antes de la ronda 1.

## Contexto y objetivo
Que una Prueba pueda quedar preparada (plantilla elegida o cambiada) antes de entrar a revisión, desde la web, la API o el bot, y que el envío a revisión no se trabe por no tener un link o archivo que adjuntar.

## Usuarios
- Asignado de la Prueba: envía y reenvía a revisión.
- Revisor, PM del proyecto o administrador: elige o cambia la plantilla.
- Claude (API / skill sdd) y el bot Chontatec, con los permisos de quien los usa.

## Historias de usuario
- HU-1. Como asignado, quiero enviar una Prueba a revisión sin adjuntar nada, para no inventar un link cuando el revisor ya sabe qué revisar.
- HU-2. Como revisor/PM, quiero cambiar la plantilla de una Prueba desde su página antes de que se envíe, para dejarla lista sin recrear la tarea.
- HU-3. Como persona que usa el bot, quiero que cree la Prueba con su plantilla o se la asigne después.

## Requisitos funcionales (EARS)
- RF-1: CUANDO el asignado envía una Prueba a revisión (ronda 1) sin ningún link ni archivo, EL SISTEMA crea la ronda igual, copia la plantilla elegida y avisa al revisor como hoy.
- RF-2: CUANDO el asignado reenvía una Prueba devuelta sin ningún link ni archivo, EL SISTEMA crea la ronda nueva igual.
- RF-3: SI al reenviar hay pruebas «Con errores» sin respuesta o sin evidencia de corrección, ENTONCES EL SISTEMA sigue rechazando el reenvío como hoy (lo de cada prueba no cambia).
- RF-4: SI se adjunta un link, EL SISTEMA lo sigue validando como hoy (https://).
- RF-5: Lo mismo vale por API: `POST /tasks/:id/review/rounds` acepta `deliverables` vacío u omitido, y el diseño de Prueba (`POST /tasks/:id/design`) crea la primera ronda sin entregable.
- RF-6: MIENTRAS una Prueba no tenga ronda 1, EL SISTEMA muestra en su página la plantilla de pruebas elegida y permite a revisor, PM o administrador cambiarla o quitarla; el asignado sin ese rol la ve sin poder cambiarla.
- RF-7: CUANDO ya existe la ronda 1, EL SISTEMA deja de mostrar ese selector (desde ahí se usa «Usar una plantilla de pruebas…» de la ronda, como hoy).
- RF-8: CUANDO se le pide al bot crear una tarea de tipo Prueba, EL SISTEMA le permite indicar revisores y plantilla; y el bot tiene una acción para cambiar o quitar la plantilla de una Prueba antes de la ronda 1, con el botón de confirmación como toda escritura.
- RF-9: La documentación de la API (skill del repo) y la del bot dejan de decir que el entregable es obligatorio.

## Requisitos no funcionales
- Mismos permisos que hoy (`canEditTask` para enviar, `canReviewTask` para plantilla).
- Textos de la app impersonales, sin jerga.

## Casos límite
- Prueba sin plantilla y sin entregable: se envía; la ronda nace vacía y el revisor agrega pruebas a mano o aplica una plantilla.
- Plantilla borrada después de elegirla: queda «sin plantilla» (comportamiento actual de la base, `SetNull`).
- Tarea completada: no se puede cambiar la plantilla (regla actual).

## Fuera de alcance
- Aceptaciones (ya no exigen entregable para la ronda 1). Ajustes.
- Evidencia por prueba (calificar con error/hallazgo, corrección al reenviar): no cambia.

## Criterios de finalización
- Todos los RF en ✅, `tsc` y `lint` limpios y un chequeo ejecutable del envío sin entregable.

## Decisiones tomadas en la entrevista
- ¿Hasta dónde es opcional el entregable? → Envío y reenvíos; lo de cada prueba queda igual (el revisor suele saber dónde está el repo o documento).
- ¿Selector de plantilla en la página de la tarea? → Sí, mientras no exista la ronda 1.
- ¿El bot asigna plantilla? → Sí, al crear y después.

## Dudas abiertas
(ninguna)
