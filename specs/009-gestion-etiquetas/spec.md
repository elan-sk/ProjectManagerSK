# 009 — Gestión de etiquetas

Pedido: eliminar etiquetas individuales y mostrar cantidad de tareas por categoría y etiqueta en Configuración → Etiquetas.

- Listar etiquetas por categoría, identificando su proyecto; incluir etiquetas sin uso y sin nombre (Solo categoría).
- Contar todas las tareas asociadas, incluidas completadas y archivadas, dentro de los proyectos visibles (incluidos archivados).
- Una tarea tiene como máximo una etiqueta de cada categoría; el total de la categoría suma los conteos de sus etiquetas visibles.
- Solo administradores eliminan definitivamente, como sucede con categorías. Validar sesión real y visibilidad del proyecto en servidor.
- Confirmar antes de eliminar; se eliminan etiqueta y vínculos, nunca tareas. Mostrar errores y bloquear acciones mientras se procesa.
- No cambiar esquema, migrar bases, desplegar ni regenerar el ZIP anterior.

## Impacto

Se ajustan la página, panel y acciones de etiquetas. Selectores de tareas, filtros, buscador, API y bot consultan las mismas relaciones: el borrado en cascada de TaskTag elimina las referencias; no se cambian sus contratos. Invalidar vistas de la app tras eliminaciones. WhatsApp, colas y schedulers: sin nuevas operaciones ni avisos.

## Validación

Tipos, lint y chequeo ejecutable de agrupación/conteos; revisar relaciones de borrado del esquema. Sin pruebas sobre producción.

## Ampliación: editar etiquetas

Se puede editar el nombre desde cada fila (Guardar/Cancelar), por administradores o PM del proyecto, incluido el PM del padre. Validación de sesión y alcance en servidor. Nombre obligatorio de hasta 80 caracteres, sin espacios extremos; duplicados en igual proyecto/categoría muestran error. No se fusionan etiquetas ni se cambian IDs, vínculos, proyecto o categoría. Todas las tareas, selectores, filtros, API y bot leen el nombre actualizado de la misma etiqueta. Se conserva el contador. Sin nuevas migraciones ni avisos.
