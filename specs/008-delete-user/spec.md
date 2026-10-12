# Especificación 008 — Eliminar un usuario de forma definitiva

Estado: aprobada

| | |
|---|---|
| Origen | Pedido por chat, 2026-10-12 |

## Pedido original

«Quiero tener la opción de poder eliminar un usuario de forma definitiva. Déjame las dos opciones: poder desactivar, como hoy, que oculta a esa persona, y una opción de eliminar definitivo; y cuando se vaya a eliminar, da la opción de reasignar sus contraseñas y tareas vigentes a alguien (pero en bloque, no una por una).»

## Fuentes

- Pedido del chat y entrevista del 2026-10-12.
- Código del repo: modelo de usuario y sus relaciones, acciones de usuarios en Configuración, regla de acceso a contraseñas.
- Antecedente en el código: el borrado real de usuarios existió y se reemplazó por la desactivación, porque varias tablas exigen que la persona exista y el borrado en cascada llegó a colgar la app en el hosting.

## Contexto y objetivo

Hoy un administrador solo puede desactivar a una persona: deja de entrar y de poder ser asignada, pero sigue en la lista de inactivos con todos sus datos. Falta una salida definitiva para quien ya no vuelve: que sus datos personales desaparezcan, que no quede en ninguna lista y que su trabajo pendiente y sus contraseñas pasen a otra persona en un solo paso.

## Usuarios

- **Administrador**: único que puede eliminar definitivamente.
- **Persona que recibe**: quien queda con las tareas, las contraseñas o los proyectos.
- **Resto del equipo y clientes**: siguen viendo el historial de los proyectos, firmado «Usuario eliminado».

## Definiciones

- **Desactivar**: lo que existe hoy. La persona no entra ni se le asigna nada nuevo; se puede reactivar.
- **Eliminar definitivamente**: se borran sus datos personales y accesos; no se puede deshacer ni reactivar.
- **Tarea vigente**: tarea no completada ni archivada, de un proyecto no archivado, donde la persona es asignada o revisora.
- **Contraseñas de la persona**: las que creó (incluidas las de visibilidad «Solo yo») y las que puede ver por estar marcada en «Personas concretas».

## Historias de usuario

- HU-1. Como administrador, quiero eliminar definitivamente a alguien que ya no vuelve, para que no quede en ninguna lista ni se conserven sus datos personales.
- HU-2. Como administrador, quiero pasar en bloque sus tareas vigentes, sus contraseñas y sus proyectos a otra persona, para no reasignar una por una.
- HU-3. Como miembro del equipo, quiero seguir viendo el historial de mis proyectos aunque se elimine a quien lo escribió.

## Requisitos funcionales (EARS)

### Dos opciones

- RF-1: EL SISTEMA ofrece, por cada persona en Configuración → Usuarios, dos acciones separadas: «Desactivar» (comportamiento actual, reversible) y «Eliminar definitivamente».
- RF-2: EL SISTEMA ofrece «Eliminar definitivamente» también para personas ya desactivadas.
- RF-3: SI quien intenta eliminar no es administrador, o intenta eliminarse a sí mismo, ENTONCES EL SISTEMA lo rechaza con un mensaje en lenguaje simple.

### Formulario de eliminación

- RF-4: CUANDO se elige «Eliminar definitivamente», EL SISTEMA abre un formulario que muestra cuántos proyectos tiene la persona como PM, cuántas tareas vigentes y cuántas contraseñas.
- RF-5: SI la persona es PM de algún proyecto, ENTONCES EL SISTEMA exige elegir un nuevo PM y no permite eliminar sin elegirlo; todos sus proyectos pasan a esa persona.
- RF-6: SI la persona tiene tareas vigentes, ENTONCES EL SISTEMA ofrece elegir a quién pasan todas, o «No reasignar».
- RF-7: SI la persona tiene contraseñas, ENTONCES EL SISTEMA ofrece elegir a quién pasan todas, o «No reasignar».
- RF-8: EL SISTEMA ofrece como destino solo personas activas, distintas de la que se elimina; los tres destinos pueden ser personas diferentes.
- RF-9: CUANDO se confirma, EL SISTEMA pide una confirmación final que advierte que la acción no se puede deshacer.

### Reasignación en bloque

- RF-10: CUANDO se elige destino para las tareas, EL SISTEMA reemplaza a la persona por el destino en cada tarea vigente, con el mismo papel (asignada o revisora), sin duplicar al destino si ya tenía ese papel.
- RF-11: CUANDO se elige «No reasignar» para las tareas, EL SISTEMA quita a la persona de sus tareas vigentes y no agrega a nadie.
- RF-12: CUANDO se elige destino para las contraseñas, EL SISTEMA deja al destino como quien creó cada contraseña que la persona había creado (incluidas las «Solo yo») y le da los accesos que la persona tenía por «Personas concretas».
- RF-13: CUANDO se elige «No reasignar» para las contraseñas, EL SISTEMA elimina las «Solo yo» de la persona (nadie más podría verlas) y deja las demás sin creador, administrables por el PM del proyecto o un administrador, como hoy.
- RF-14: EL SISTEMA no modifica las tareas completadas o archivadas: conservan a la persona en su historial.
- RF-15: CUANDO hay reasignación, EL SISTEMA deja a cada persona que recibe un solo aviso dentro de la app con el resumen de lo recibido, y no envía un WhatsApp por cada tarea.

### Efecto sobre la cuenta

- RF-16: CUANDO se elimina, EL SISTEMA borra de la cuenta el nombre (pasa a «Usuario eliminado»), el usuario, el correo, el teléfono, la foto y la clave, y cierra todas sus sesiones y accesos (web, API, links «Conectar IA», avisos del navegador, Google Calendar).
- RF-17: EL SISTEMA borra lo que era solo de esa persona: sus notificaciones, su historial del chat con el bot y sus marcas de lectura.
- RF-18: EL SISTEMA conserva lo que pertenece a los proyectos (comentarios, mensajes y rondas de revisión, archivos subidos, links compartidos, votos, registros de acceso a contraseñas), firmado «Usuario eliminado».
- RF-19: EL SISTEMA deja libre el nombre de usuario y el correo para que otra cuenta pueda usarlos.
- RF-20: EL SISTEMA no muestra a la persona eliminada en ninguna lista ni selector: usuarios activos e inactivos, asignar, revisores, menciones, filtros por persona, Rendimiento, carga de equipo, API y chat del bot.
- RF-21: SI se intenta reactivar, editar o iniciar sesión con una cuenta eliminada, ENTONCES EL SISTEMA lo rechaza.
- RF-22: SI la eliminación falla en algún paso, ENTONCES EL SISTEMA no deja nada a medias: o se aplica todo (reasignaciones y borrado de datos) o no se aplica nada, y muestra el error en lenguaje simple.

## Requisitos no funcionales

- RNF-1: La eliminación no usa borrado en cascada de la fila de la persona; ninguna tabla de historial pierde filas por esta acción.
- RNF-2: Textos nuevos visibles: «Desactivar», «Eliminar definitivamente», «Usuario eliminado», «No reasignar», «Nuevo PM de sus proyectos», «Sus tareas vigentes pasan a», «Sus contraseñas pasan a», y los avisos de confirmación y de resultado. Todos en tercera persona.
- RNF-3: La acción queda en el registro de la app con quién eliminó, cuándo y a quién se reasignó, sin datos personales de la persona eliminada.

## Casos límite

- La persona no tiene proyectos, tareas ni contraseñas: el formulario solo pide la confirmación.
- El destino ya es asignado o revisor de una de las tareas: no se duplica.
- El destino de las contraseñas ya tenía acceso a alguna: no se duplica.
- El destino ya tiene el otro papel en una tarea (es asignado y la persona era revisora, o al revés): no recibe el segundo papel, porque nadie puede ser asignado y revisor de la misma tarea.
- La persona es revisora de una ronda abierta: el destino queda como revisor y la ronda sigue abierta.
- La persona es PM de un proyecto principal con subproyectos: el nuevo PM hereda los mismos permisos sobre los subproyectos.
- Dos administradores la eliminan a la vez: la segunda acción responde que ya fue eliminada.
- Tareas vigentes de proyectos ocultos o archivados: las de proyectos ocultos se reasignan; las de proyectos archivados no cuentan como vigentes.

## Fuera de alcance

- Borrar el historial que la persona dejó en los proyectos.
- Reasignar tarea por tarea o contraseña por contraseña a personas distintas.
- Deshacer una eliminación.
- Eliminación pedida por la propia persona.
- Cambiar cómo funciona la desactivación.

## Criterios de finalización

- `npx tsc --noEmit` y `npm run lint` sin errores nuevos; migración incluida en `npm run build`.
- Chequeo ejecutable nuevo (`verify:delete-user`) que cubre reasignación de tareas, de contraseñas y de PM, el caso «No reasignar», la conservación del historial y el «todo o nada».
- `npm run verify:credentials` sigue pasando.
- Inventario de impacto repasado, incluidos avisos de WhatsApp, resumen diario, API y chat del bot.

## Decisiones tomadas en la entrevista

- Historial → se conserva, firmado «Usuario eliminado» (se descartó conservar el nombre y se descartó borrar el historial).
- Proyectos como PM → se elige un PM nuevo en el mismo formulario, obligatorio.
- Tareas vigentes → asignada y revisora, sin completar; pasan con el mismo papel.
- Contraseñas → las que creó (incluidas «Solo yo») y sus accesos por «Personas concretas».
- Supuesto: tres destinos independientes (PM, tareas, contraseñas), para poder repartir.
- Supuesto: «No reasignar» en contraseñas elimina las «Solo yo», porque nadie más podría verlas.
- Supuesto: un solo aviso dentro de la app por persona que recibe, sin WhatsApp por tarea.
