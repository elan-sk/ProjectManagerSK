# 010 — Cargo de la persona y roles por proyecto

Pedido: que el bot sepa qué hace cada persona. Un campo «cargo» en el usuario (texto libre, ej. «Diseñador UX») y, en la Definición de cada proyecto, los roles del equipo **en ese proyecto** (quién hace qué ahí, distinto de su cargo general). Ambos informativos, y los dos los leen el bot y la API por URL.

- **Cargo (usuario)**: opcional, texto libre de hasta 80 caracteres. Se edita en Configuración → Usuarios, junto a los demás datos de la persona. Lo ve quien ya puede ver ese panel.
- **Roles del proyecto** (`ProjectRole`): una fila por miembro y proyecto, con el rol descrito libremente (hasta 120 caracteres). Un miembro puede tener roles distintos en proyectos distintos, y un proyecto tiene tantos roles como necesite. El mismo miembro no se repite en un proyecto.
- **Informativo, no permisos**: un rol NUNCA cambia quién puede editar, revisar, asignar o administrar. Los permisos siguen siendo PM, asignado, revisor y admin (`canEditTask`/`canSeeProject` no los miran). Esto es explícito y no se debe "mejorar" después sin un pedido aparte.
- **Quién edita**: el PM del proyecto (incluido el del principal, para un subproyecto) y un administrador — el mismo alcance que ya exige editar la Definición. El resto del equipo ve los roles, sin poder cambiarlos.
- **Solo miembros reales**: se eligen personas del equipo (usuarios activos). No hay roles de texto libre sin persona: el valor del pedido es saber a quién preguntarle.
- **Panel «Equipo y roles»** en la pestaña Definición, junto a los demás bloques: lista los roles con la persona (nombre, cargo general y rol en el proyecto) y permite agregar, editar y quitar. Sin roles cargados, invita a agregar el primero.
- **Bot**: `list_team_members` incluye el cargo de cada persona y `get_project_definition` incluye los roles del proyecto. Las reglas operativas le indican que use ese contexto para responder «quién hace qué», sin inventar roles que no estén cargados.
- **API por URL**: los endpoints de equipo y de definición exponen lo mismo que el bot, con la misma validación de visibilidad (el actor real, nunca un id recibido por parámetro).
- **Búsqueda**: el cargo de una persona y el rol en el proyecto entran al texto buscable de sus tareas, con el mismo peso bajo que el nombre del proyecto (peso 0.15), para no desplazar títulos ni descripciones.

## Impacto

Esquema: `User.cargo` (nullable) y modelo `ProjectRole` con cascada por proyecto y por usuario. Migración nueva — esta entrega **sí** toca el esquema en producción (corre dentro de `npm run build`).

Consumidores revisados: ficha de usuario (Configuración), pestaña Definición del proyecto, herramientas del bot (`list_team_members`, `get_project_definition` y las reglas operativas), API pública v1 (equipo y definición), buscador (`/api/search`, peso de contexto) y el borrado de usuario (los roles cuelgan del usuario y del proyecto, en cascada; desactivar un usuario no borra sus roles, igual que su historial).

WhatsApp, colas y tareas programadas: sin cambios — ningún mensaje automático usa el cargo ni los roles.

## Validación

Tipos, lint y chequeo ejecutable (`scripts/verify-project-roles.ts`): permisos de edición (PM del proyecto, PM del padre y admin; un miembro cualquiera no), que el mismo miembro no se duplique en un proyecto, validación de texto (vacío y largo máximo) y que el cargo y el rol lleguen al texto que leen el bot y la búsqueda. Sin pruebas sobre producción.
