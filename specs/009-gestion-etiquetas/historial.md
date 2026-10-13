# Historial 009

2026-10-12: agregadas etiquetas individuales bajo cada categoría en Configuración, identificadas por proyecto. Contadores derivados de TaskTag (una relación por tarea y categoría), incluidas etiquetas sin uso. Se reutilizan permisos centralizados, confirmación y relaciones existentes; módulo nuevo tagSummary para presentar y verificar los conteos sin base de datos.

Eliminación individual exclusiva para administradores con sesión real y filtro visibleProjectWhere. La FK Tag → TaskTag elimina vínculos sin eliminar Task. La categoría mantiene su alcance global y la confirmación lo aclara. Errores visibles y estado pendiente en ambas eliminaciones. Se invalidan las vistas tras cambios de categorías/etiquetas.

No se ejecutaron migraciones, eliminaciones reales ni despliegues. No se regeneró el ZIP. Pendiente la comprobación visual e interacción en navegador.

Validación: tsc --noEmit, verify:tag-summary y verify:search-filters correctos. Lint general: 11 errores y 7 advertencias en archivos ajenos a este cambio (scripts WhatsApp, ProjectCardsOrder, GanttBar, GanttView, login, ImageCropModal, ReferencePopover y otros avisos existentes).

Lint dirigido a los cinco archivos TypeScript modificados/nuevos: correcto, sin errores ni advertencias.

2026-10-12: ampliación solicitada para editar nombres de etiquetas. Botón Editar con formulario Guardar/Cancelar y aviso de alcance sobre todas sus tareas. Permiso por etiqueta: administrador o PM del proyecto (incluido padre), con alcance validado otra vez dentro de la actualización en servidor. Se conserva el ID y todas las asociaciones. Nombre normalizado y obligatorio (1–80 caracteres); la restricción única existente rechaza duplicados con mensaje visible. Sin cambios de esquema ni envíos. Tipos, chequeo de conteos/nombres y lint dirigido correctos; interacción de navegador pendiente.

2026-10-12: a petición del usuario, la edición se abre pulsando el nombre de la etiqueta, igual que en categorías. Se retira el botón separado Editar. Se mantienen formulario, permisos y contadores.

2026-10-12: se reutilizan ToolbarButton (danger) y TrashIcon para eliminar categorías y etiquetas, sustituyendo los botones de texto. Se mantienen confirmación, permisos, bloqueo mientras se procesa y etiquetas accesibles específicas. Sin cambios en componentes compartidos.
