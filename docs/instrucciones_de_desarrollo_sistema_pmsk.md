# INSTRUCCIONES DE DESARROLLO Y OPTIMIZACIÓN - SISTEMA PMSK

Actúa como un desarrollador Full Stack Senior. Tu objetivo es implementar las siguientes mejoras, correcciones y nuevas funcionalidades en la plataforma PMSK. 

Sigue una metodología progresiva de desarrollo en dos grandes fases:
1. **Fase 1:** Cambios sencillos, mejoras de UI/UX y ajustes de bajo riesgo.
2. **Fase 2:** Arquitectura de backend, integraciones avanzadas y lógica compleja.

Si tienes alguna duda técnica o bloqueo antes de ejecutar un bloque específico, consulta antes de implementar.

---

## FASE 1: CAMBIOS SENCILLOS Y MEJORAS UX/UI (BAJO RIESGO)

### 1. UX/UI en Tablero y Tareas
* **Acciones en Cards del Tablero:** 
  * Click simple sobre la card abre la tarea.
  * Click sostenido permite arrastrar y soltar (Drag & Drop).
* **Comportamiento al completar tareas en Tablero:** Al arrastrar a la columna "Completada", mueve la card visualmente de inmediato a esa columna y abre la confirmación. Si el usuario cancela o la respuesta no es válida, devuélvela a la posición original; si confirma, procesa el cambio en el servidor.
* **Organización visual en detalle de tarea:** 
  * Ubica la descripción de la tarea arriba de la lista de checklists, alineando formato y estilos a las demás secciones (Checklists, Insumos, etc.).
  * Agrega capacidad de reordenar los ítems del checklist mediante Drag & Drop (arrastre).
* **Ajustes visuales de adjuntos y links:** 
  * Rediseña los enlaces en insumos/archivos para que sean más vistosos, manteniendo la línea estética minimalista de la app.
  * Agrega un visor integrado para videos de YouTube a partir de los links adjuntos.
  * Al solicitar subir un link en la herramienta de carga, pide primero la `URL` y en segundo lugar el `Nombre`.

### 2. Sistema de Filtros
* **Persistencia visual de ítems filtrados:** Cuando un filtro esté activo y el estado de una tarea cambie, NO la hagas desaparecer inmediatamente si ya no coincide con el criterio. Mantenla visible hasta que el usuario reinicie o actualice los filtros manualmente.
* **Botón para resetear filtros:**
  * Añade un botón compacto de reseteo en todos los paneles de filtros (estilo icono minimalistico de la app; tooltip en hover).
  * El botón **solo debe ser visible cuando haya al menos un filtro activo** y debe contar con un indicador visual claro para advertir al usuario que la vista actual está filtrada.
* **Filtro por fecha:** Añade un filtro de rango de fechas en todas las vistas mediante un selector interactivo tipo calendario (estilo reserva de hotel).
* **Filtro de adjuntos:** Agrega la opción "Archivos adjuntos" en el filtro "Vista" para filtrar tareas que contengan archivos cargados.

### 3. Ajustes de Navegación, Búsqueda y Notificaciones Locales
* **Buscador rápido en Header:**
  * Crea una barra de búsqueda rápida integrada en el header.
  * Debe desplegar un listado de resultados coincidentes en tiempo real a medida que el usuario escribe (sin modales ni popups invasivos que ralenticen o alteren el uso normal de la app).
  * Debe incluir todo elemento que coincida: proyectos, tareas, comentarios, archivos, links, etc.
  * **Tolerancia de búsqueda:** Implementa tolerancia a fallos/errores tipográficos (búsqueda insensible a mayúsculas/minúsculas, tildes, palabras mal escritas o frases que no coincidan al pie de la letra).
* **Navegación general:** Haz que cualquier clic en el icono de un proyecto reaccione redirigiendo a la vista principal de dicho proyecto.
* **Vista preliminar de proyectos (Recientes):** Coloca la opción de resumen en la vista preliminar fuera del listado de proyectos individuales (replicando la lógica de "Recientes" al refiltrar).
* **Soporte de texto:** Implementa corrector ortográfico integrado en todos los campos editables e inputs de texto.
* **Ajuste en formato de horario:** Cambia el selector de horario laboral (envío de alertas por WhatsApp) a formato de 12 horas con AM/PM.
* **Formato en notificaciones diarias:** Representa el porcentaje de avance de los proyectos mediante una barra gráfica de 10 bloques/caracteres donde cada uno representa un 10% (utiliza colores dinámicos o caracteres visuales claros).
* **Gestión de imágenes de perfil:** Corrige el problema de persistencia/ubicación donde las imágenes de perfil de los usuarios desaparecen, relocalizándolas en un almacenamiento/path persistente seguro.

---

## FASE 2: FUNCIONALIDAD AVANZADA, INTEGRACIONES Y BACKEND (MAYOR COMPLEJIDAD)

### 1. Mejoras en la Bot del Chat / Asistente IA
* **Identificación contextual del usuario:** Garantiza que la bot reconozca la identidad e ID del usuario con el que interactúa en el chat para validar estrictamente sus permisos antes de ejecutar cualquier acción.
* **Extensión de herramientas y capacidades del Chat:**
  * **Proyectos:** Crear, editar (nombre, cliente, fechas, icono), archivar o eliminar.
  * **Fases:** Crear, renombrar, reordenar y borrar fases.
  * **Definición:** Gestionar objetivos, alcance y requerimientos.
  * **Fechas de tareas:** Permitir cambiar `plannedStart` o duración de tareas creadas ajustándose estrictamente a los permisos del usuario ejecutor.
  * **Checklists:** Crear nuevos pasos de checklist (convertir listas/puntos detectados en el chat directamente en checklist).
  * **Adjuntos:** Habilitar subida de archivos y lectura de contenido (actualmente solo lee nombre y tipo).
  * **Revisores:** Agregar y remover revisores de tareas.
  * **Comentarios:** Dejar notas/bitácoras en tareas.
  * **Notificaciones:** Habilitar la capacidad de disparar manualmente los mensajes de resumen diarios.
* **Optimización de respuesta al crear tareas:** Oculta los IDs técnicos (`taskId`, `projectId`) en el mensaje final enviado por el chat al usuario. Solo confirma claramente la creación de la tarea.

### 2. Comentarios, Menciones y Notificaciones Integradas
* **Edición y eliminación:** Permite editar y eliminar comentarios en la sección de comentarios internos.
* **Rich Media en comentarios:** Habilita la subida de imágenes, archivos y enlaces en comentarios de tareas y proyectos. Todos los archivos y links deben mapearse a las pestañas generales de "Insumos" y "Filtro de archivos".
* **Soporte para Portapapeles:** Permite pegar imágenes directamente desde el portapapeles (`Ctrl+V` / `Cmd+V`) en cualquier área de carga de archivos.
* **Sistema de menciones (`@mencion`):**
  * Al escribir `@` en comentarios, despliega lista de usuarios.
  * La mención dispara una notificación interna (icono de mensajes) y un mensaje vía WhatsApp.
  * El mensaje de WhatsApp debe incluir: nombre del remitente, contenido completo del mensaje y enlace directo a la conversación.
  * Esta notificación por WA también debe configurarse para nuevos comentarios en conversaciones donde el usuario sea asignado, revisor o participante.
* **Regla de omisión de notificaciones (Self-Notification Suppress):** Omite en **todos** los canales el envío de notificaciones al propio usuario creador/ejecutor de la acción (al crear tareas, cambiar estados, enviar comentarios, etc.).

### 3. Módulo de Integración con WhatsApp
* **Reconexión y persistencia de sesión:** Implementa un protocolo de reconexión automática en background. La conexión debe mantenerse viva sin importar si el administrador tiene la sesión web abierta o no.
* **Alarma de desconexión:** Agrega un indicador/alerta de salud de conexión en el header (exclusivo para el Administrador) cuando el bot de WhatsApp pierda conexión.
* **Ajustes en envío de mensajes:**
  * **Prueba de configuración:** El mensaje de prueba desde los ajustes de WA debe enviarse al número del usuario solicitante.
  * **Corrección de cron/horarios:** Corrige la reprogramación de notificaciones diarias cuando el usuario cambia el horario a una hora posterior a la hora actual del sistema.
  * **Criterio de envío de resumen diario:** Garantiza que el resumen diario se despache a la totalidad de los usuarios. En caso de error o imposibilidad de envío, notifica al administrador con el reporte y motivo del fallo.
  * **Manejo de excepciones en cálculo de fechas:** Corrige el falso positivo de retraso ("Terminó 1 día hábil después...") en tareas que inician, finalizan y se completan el mismo día.

### 4. Nuevas Funcionalidades en Tareas y Proyectos
* **Duplicar Tareas:** Añade la opción "Duplicar" en el menú de contexto/acciones de tarea.
* **Combinar Tareas (Merge):** Habilita la selección múltiple de tareas en las vistas generales para combinarlas en una sola. La tarea resultante integrará cada tarea original como un paso del checklist, unificando comentarios y archivos adjuntos bajo un nuevo título.
* **Gestión de Archivos Reutilizables (Galería de Medios):** En el modal de carga de componentes, permite seleccionar archivos/links previamente subidos mediante una galería de medios para evitar duplicar archivos físicos en el servidor.
* **Múltiples Repositorios:** Añade soporte para vincular múltiples repositorios de código por proyecto.
* **Visibilidad de Proyectos:** Opción exclusiva para administradores de "Ocultar proyecto" (icono de ojo) desde la vista resumen o del proyecto para invisibilizarlo a los demás miembros del equipo.
* **Tareas Urgentes:**
  * Opción para Admin y PM de marcar tarea como "Urgente".
  * **Comportamiento visual:** Quedan ancladas en la parte superior en Tableros/Agenda con icono distintivo y cambio de color; en Gantt resalta el encabezado con icono; en Calendario modifica color e icono.
  * **Header:** Crea un acceso directo exclusivo en el header con el contador/lista de tareas urgentes.
  * **Persistencia:** La alerta de urgencia **NO se puede marcar como leída ni quitar manual de la lista**, solo desaparece al completar o desmarcar la tarea.
  * **Notificación inmediata:** Se despacha notificación prioritaria e inmediata por WhatsApp.
* **Mecanismo de Archivado de Tareas Completadas:**
  * Agrega un botón para "Archivar" exclusivo en la sección/columna de tareas completadas.
  * **Permisos:** Habilitado únicamente para roles Admin y PM en sus respectivos proyectos.
  * **Comportamiento:** Remueve las tareas completadas del flujo visual normal sin eliminarlas de la base de datos (permanecen disponibles para consultas e historial, conservando su estado de completadas).

### 5. Métricas de Rendimiento, Control de Actividad y Seguridad
* **Auditoría y Corrección del % de Cumplimiento a Tiempo:** 
  * Revisa y corrige la fórmula de cálculo del porcentaje de cumplimiento a tiempo en el módulo de métricas (actualmente marca 100% incorrectamente).
  * Asegura que el cálculo evalúe estricta y comparativamente la **fecha/hora real de finalización de la tarea** contra su **fecha límite planeada (`plannedEnd`)**. Toda tarea completada con posterioridad a su fecha límite debe contarse como **entregada a destiempo** y restar porcentaje a la métrica global/individual. Realiza pruebas unitarias para validar que el porcentaje varíe correctamente según las entregas fuera de plazo.
* **Métrica "Carga de Equipo":** Rediseña este indicador en el panel de rendimiento para mostrar el nivel de aporte/contribución relativo de cada integrante (global o filtrado por proyecto).
* **Métrica de uso/frecuencia (Admin):** Agrega un indicador en el panel de rendimiento individual que calcule la frecuencia promedio diaria de accesos e interacciones reales de los usuarios con la app (para detectar inactividad sin basarse solo en logs de inicio de sesión).
* **Excepción de horario en Restablecimiento de Contraseña:** Excluye el flujo de recuperación/restablecimiento de contraseña de las restricciones de horario laboral (debe operar 24/7).