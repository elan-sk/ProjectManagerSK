# Especificación 018 — Rol «Coordinador»

Estado: implementada

| | |
|---|---|
| Origen | Pedido por chat, 2026-11-06 |

## Pedido original

> «necesito un tipo de usuario intermedio entre un usuario raso y un pm, es decir un usuario que sin ser pm, pueda crear un proyecto donde él va a ser el pm y ahí adquiere permiso de pm para su proyecto sin poder modificar el pm de proyectos ajenos y déjame el raso que definitivamente no pueda crear ningún proyecto ni siquiera para él mismo.»
>
> «el miembro solo puede estar en los demás o ser asignado por un administrador y tenemos el intermedio que podría crear proyecto para sí y para otros, pero no tiene acceso a data sensible, y no puede reasignar proyectos que no creó»
>
> «va a tener solo los datos de los proyectos y crear clientes nuevos solo dentro de sus proyectos y usar lo que ya existe, pero no puede tocar lo de la empresa y detalles más sensibles: eso solo lo puede hacer el administrador»

## Contexto y objetivo

Hoy cualquier Miembro puede crear proyectos (botón «+ Nuevo proyecto», bot y API no revisan el rol) y ponerle de PM a cualquiera. Se cierra esa puerta y se crea un rol intermedio que sí puede crear proyectos, sin acceso a lo que es solo del administrador.

## Usuarios

- **Miembro**: participa en proyectos ajenos (responsable, revisor) y es PM solo si se lo asigna un administrador o un Coordinador. No crea proyectos ni clientes.
- **Coordinador** (nuevo): lo de un Miembro + crear proyectos (para sí o para otro PM) y clientes nuevos al crearlos; cambia el PM solo de los proyectos que creó.
- **Administrador**: sin cambios.

## Historias de usuario

- HU-1. Como administrador, quiero dar el rol «Coordinador» a una persona para que arme sus propios proyectos sin darle acceso de administrador.
- HU-2. Como Coordinador, quiero crear un proyecto y quedar como PM (o poner a otro) para organizar mi trabajo.
- HU-3. Como administrador, quiero que un Miembro no pueda crear proyectos por ninguna vía.

## Requisitos funcionales (EARS)

- RF-1: EL SISTEMA ofrece tres roles de usuario: Miembro, Coordinador y Administrador, elegibles al crear un usuario y al cambiar su rol en Configuración → Usuarios.
- RF-2: SI un Miembro intenta crear un proyecto o subproyecto por cualquier vía (formulario, asistente de proyectos, bot, API), ENTONCES EL SISTEMA lo rechaza con un mensaje en lenguaje simple y no crea nada.
- RF-3: MIENTRAS el usuario sea Miembro, EL SISTEMA no le muestra el botón «+ Nuevo proyecto» ni el botón del asistente de proyectos, y el bot no le ofrece crear proyectos.
- RF-4: CUANDO un Coordinador o un administrador crea un proyecto, EL SISTEMA guarda quién lo creó y le permite elegir como PM a cualquier usuario activo (por defecto, él mismo).
- RF-5: CUANDO se cambia el PM de un proyecto, EL SISTEMA lo permite solo a un administrador o al Coordinador que creó ese proyecto (mientras siga siendo Coordinador). SI lo intenta otra persona (incluido el PM del proyecto), ENTONCES lo rechaza.
- RF-6: EL SISTEMA da al Coordinador, en los proyectos donde es PM, los mismos permisos que a cualquier PM; en un proyecto que creó para otro PM, solo puede cambiar el PM.
- RF-7: CUANDO un Coordinador crea un proyecto, EL SISTEMA le muestra en el selector «Cliente» los nombres de todos los clientes, y le permite escribir uno nuevo, que se crea.
- RF-8: SI un usuario que no es administrador ni Coordinador intenta crear un cliente nuevo (al crear o editar un proyecto, por el bot o por la API), ENTONCES EL SISTEMA lo rechaza; solo puede elegir clientes existentes que ya ve.
- RF-9: EL SISTEMA mantiene para el Coordinador las mismas restricciones que para el Miembro en todo lo que hoy es solo de administrador (Empresa, ficha de clientes, configuración, usuarios, rendimiento global, aprendizajes de la empresa, proyectos ocultos).
- RF-10: CUANDO se aplica el cambio, EL SISTEMA pasa a Coordinador a todo Miembro que hoy es PM de al menos un proyecto.
- RF-11: EL SISTEMA muestra el rol «Coordinador» con ese nombre donde hoy se muestra «Miembro» o «Administrador» (lista de usuarios, importación).

## Casos límite

- Proyectos ya existentes: no tienen creador guardado → solo un administrador cambia su PM.
- Un Coordinador al que le bajan el rol a Miembro conserva el PM de sus proyectos, pero ya no crea proyectos ni cambia PM.
- Un Miembro que es PM de un proyecto no crea subproyectos: crear un subproyecto cuenta como crear un proyecto (RF-2), porque el pedido dice que el Miembro no crea ninguno.

## Fuera de alcance

- Permisos nuevos de lectura: el Coordinador ve exactamente lo mismo que un Miembro, más la lista de nombres de clientes en el selector.
- Cambiar quién puede archivar proyectos u ocultarlos.

## Criterios de finalización

- tsc y lint sin errores; migración aplicada en local; cada RF verificado por lectura de código o script.

## Decisiones tomadas en la entrevista

- Nombre del rol → «Coordinador».
- Coordinador que crea un proyecto para otro PM → solo puede volver a cambiar el PM.
- Miembros que hoy son PM → pasan a Coordinador.
- Selector de clientes del Coordinador → todos los nombres (la ficha sigue limitada).
- PM elegible por el Coordinador → cualquier usuario activo.
- Miembro PM → no crea clientes nuevos, solo elige existentes.

## Dudas abiertas

Ninguna.
