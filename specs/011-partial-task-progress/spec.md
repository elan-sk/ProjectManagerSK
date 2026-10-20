# Especificación 011 — Avance del proyecto con el avance interno de las tareas

Estado: implementada

| | |
|---|---|
| Origen | Pedido por chat, 2026-10-20 |

## Pedido original

> «No, porque las tareas no están finalizadas, hasta que no se pasen a completadas la aplicación no lo toma en cuenta aunque están avanzadas, en otras palabras la aplicación está calculando el retraso como si no se hubiesen hecho, cuando ya se marquen como completadas ya se recalcula, por eso no se mueve el avance! — es que tengo tráfico y voy a mostrar el mismo 25 % que hace 15 días» (conversación con el jefe).
>
> Una tarea en revisión debería aportar al cálculo del proyecto; según el tipo y el estado de cada tarea, cierto nivel de porcentaje: que se tenga presente el avance interno de las tareas para calcular el avance del proyecto.

## Contexto y objetivo

Hoy el avance de un proyecto (y de sus fases, requerimientos, objetivos y subproyectos) es *tareas completadas ÷ total*: una tarea al 90 % o una Prueba en revisión aporta 0 hasta que se marca completada. Por eso el porcentaje queda quieto durante semanas aunque el equipo avance. Además, el retraso proyectado trata a una tarea en curso vencida como si le faltara toda su duración desde hoy.

Objetivo: que el porcentaje y el retraso proyectado reflejen el trabajo hecho, sin que una tarea abierta llegue al 100 %.

## Usuarios

PM, administradores y miembros que ven el avance en la app; el jefe/cliente que lo ve en el link compartido; quienes reciben el resumen por WhatsApp o consultan al bot.

## Historias de usuario

- HU-1. Como PM, quiero que el avance del proyecto suba cuando las tareas avanzan (checklist, puntos, revisión), para mostrar el progreso real sin esperar a cerrarlas.
- HU-2. Como PM, quiero que el retraso proyectado considere lo que ya se hizo de una tarea vencida, para no mostrar un retraso exagerado.

## Definiciones

- **Avance interno de una tarea**: la barrita que ya muestra la tarjeta — pasos hechos del checklist ÷ total (tareas simples y entregables), o puntos respondidos ÷ total (Prueba, Ajuste, Aceptación).
- **En revisión**: Prueba con una ronda abierta o aprobada sin cerrar; Aceptación con una ronda abierta (esperando al cliente) o aceptada sin cerrar; Entregable con su evidencia cargada en «Resultado» sin completar.
- **Aporte de una tarea**: el porcentaje con el que cuenta en el avance de su fase, requerimiento, objetivo y proyecto.

## Requisitos funcionales (EARS)

- RF-1: EL SISTEMA calcula el aporte de cada tarea así: Completada = 100 %; Sin iniciar = 0 %; En revisión = 90 %; En curso, Devuelta o Bloqueada = su avance interno con tope de 90 %, o 25 % si no tiene checklist ni puntos.
- RF-2: SI una tarea en revisión tiene un avance interno mayor que 90 %, ENTONCES EL SISTEMA usa 90 % (solo una tarea completada aporta 100 %).
- RF-3: EL SISTEMA calcula el avance de una fase, de un requerimiento (con tareas propias) y del proyecto como el promedio simple del aporte de sus tareas (cada tarea pesa igual, como hoy). Objetivos y requerimientos sin tareas propias siguen promediando lo que tienen vinculado, como hoy.
- RF-4: El avance de un proyecto principal con subproyectos y el de cada subproyecto (lista de Subproyectos, popovers, tarjeta resumen, Agenda) usan el mismo cálculo del RF-3.
- RF-5: Donde hoy se muestra el porcentaje de avance (resumen del proyecto, Definición, Gantt por fase, tarjetas de Proyectos y Archivados, Agenda, link compartido con el cliente, resumen diario de WhatsApp y respuestas del bot), EL SISTEMA muestra el avance del RF-3. Donde hoy se muestra el conteo «N/M tareas» o «N de M completadas», el conteo se mantiene igual (cuenta solo completadas).
- RF-6: CUANDO una tarea En curso, Devuelta o Bloqueada ya pasó su fecha de fin, EL SISTEMA proyecta que le falta su duración × (100 % − su aporte), redondeado hacia arriba y como mínimo 1 día hábil desde hoy (antes: la duración completa).
- RF-7: CUANDO una tarea en revisión ya pasó su fecha de fin, EL SISTEMA proyecta que le falta 1 día hábil desde hoy.
- RF-8: EL SISTEMA no modifica ninguna fecha guardada ni el estado de ninguna tarea: el cambio es solo de cálculo.

## Requisitos no funcionales

- Una sola regla compartida para el aporte de una tarea: ninguna pantalla, reporte, bot o aviso lo recalcula por su cuenta.
- Sin cambios en la base de datos.

## Casos límite

- Proyecto, fase o requerimiento sin tareas: 0 %, como hoy.
- Tarea con checklist vacío (0 pasos) y sin puntos: cuenta como «sin checklist» (25 % si está en curso).
- Prueba con una ronda nueva sin responder: su avance interno baja (10 de 20); si está en revisión, aporta 90 % igual.
- Prueba o Aceptación devuelta: estado Devuelta → su avance interno con tope de 90 %.
- Tarea en curso con todo el checklist hecho pero sin completar: 90 %.
- Redondeo: los porcentajes se muestran enteros, como hoy.

## Fuera de alcance

- Alertas de «vencida», semáforo de salud del proyecto y avisos de WhatsApp sobre tareas vencidas: no cambian (una tarea en revisión con la fecha pasada sigue avisando).
- Ponderar las tareas por duración.
- Configurar los porcentajes (25 % / 90 %) desde la app.
- Métricas de desempeño (a tiempo, primera pasada): no cambian.

## Criterios de finalización

- Todos los RF verificados con un chequeo ejecutable (`scripts/verify-*.ts`) además de `tsc` y `lint`.
- Inventario de impacto del plan con cada consumidor ✅ o ➖ justificado.

## Decisiones tomadas en la entrevista

- Regla de aporte → avance interno con tope de 90 %; en revisión 90 %; sin checklist 25 % (refleja el trabajo hecho y solo completar da 100 %).
- Peso de cada tarea → todas igual, como hoy (el cambio queda acotado al avance parcial).
- Retraso proyectado → lo que le falta según su avance, mínimo 1 día hábil.
- Pantalla → el % pasa a ser el avance; el conteo de completadas se mantiene.
- Entregable con evidencia cargada → 90 %, como en revisión.
- Aceptación esperando al cliente → 90 %.
- Alertas de vencida → fuera de alcance.

## Dudas abiertas

Ninguna.
