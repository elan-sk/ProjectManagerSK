# Especificación 017 — Aprendizajes y tablero de la empresa

Estado: aprobada

| | |
|---|---|
| Origen | Pedido por chat, 2026-11-06 (entrega 3 de 3 del «consultor de la empresa») |

## Pedido original

> «Termina la fase 3 de los cambios.»

Fase 3 según lo acordado el 2026-11-05: «Aprendizajes» (memoria de conclusiones por proyecto y general de la empresa, con retrospectiva de los archivados) y tablero de gráficos en «Empresa» con un catálogo de indicadores calculados por la app (nunca consultas libres de la IA). Pendiente de la entrega 1: que el chat responda sobre el rendimiento de las personas con el alcance de quien pregunta (el PM, solo sus proyectos).

## Fuentes
- Spec 015 (perfil de empresa: temas «Qué quiere revisar con la aplicación» y «Consejos que espera») y 016 (asistentes, proyectos parecidos).
- Código actual: pantalla «Rendimiento» (ya filtra al PM a sus proyectos), indicadores existentes (entregas a tiempo, rondas de pruebas, errores más comunes por categoría, tiempos de revisión y corrección) y gráficos de barras y anillo.
- Entrevista del 2026-11-06 (decisiones abajo).

## Contexto y objetivo
La empresa quiere consejos basados en su propia historia, no genéricos. Esta entrega junta en un tablero los números que la app ya puede calcular, y guarda conclusiones de consultor («Aprendizajes») por proyecto y para toda la empresa, que después usan el chat y los asistentes.

Se nota que funcionó cuando un administrador ve en «Empresa» los indicadores de la empresa, genera aprendizajes de un proyecto archivado con su evidencia en cifras, los marca como aplicados o descartados, y al armar un proyecto parecido el asistente los tiene en cuenta.

## Usuarios
- **Administrador**: ve el tablero y todos los aprendizajes; genera, edita, marca y elimina.
- **PM**: ve y genera los aprendizajes de sus proyectos, salvo los que hablan del desempeño de una persona; los marca como aplicados o descartados.
- **Miembro**: no ve el tablero ni los aprendizajes.

## Definiciones
- **Indicador**: un número o serie que calcula la app con sus datos, de un catálogo fijo. Catálogo: (1) duración real vs. planeada por proyecto, (2) tareas entregadas a tiempo, (3) rondas de pruebas hasta aprobar, (4) errores más comunes en las pruebas, (5) tiempo de revisión y de corrección, (6) ajustes por proyecto, (7) aceptación del cliente al primer intento, (8) carga por persona, (9) proyectos por cliente.
- **Aprendizaje**: conclusión con **tema** (Plazos · Pruebas y calidad · Ajustes y cambios · Aceptación del cliente · Equipo y carga · Clientes · Procesos), **conclusión** (una frase), **evidencia** (las cifras de los indicadores que la sostienen), **recomendación**, **estado** (Propuesta · Aplicada · Descartada), **alcance** (empresa o un proyecto), **corte** (proyecto archivado, fase, mes o a pedido), **origen** (la app o Claude) y, si habla del desempeño de una persona, **persona**.

## Requisitos funcionales (EARS)

**Indicadores y tablero**
- RF-1: EL SISTEMA calcula los 9 indicadores del catálogo con una sola regla, que usan el tablero, la generación de aprendizajes, el chat y la API.
- RF-2: EL SISTEMA muestra en «Empresa», solo a administradores, la sección «Tablero» con un gráfico o tabla por indicador, primero los que responden a «Qué quiere revisar con la aplicación» del perfil de la empresa.
- RF-3: EL SISTEMA permite filtrar el tablero por período (último mes, últimos 3 meses, último año, todo) y por cliente.
- RF-4: SI un indicador no tiene datos en el filtro elegido, ENTONCES EL SISTEMA lo muestra con «Sin datos».

**Aprendizajes: ver y gestionar**
- RF-5: EL SISTEMA muestra en «Empresa», solo a administradores, la sección «Aprendizajes» con todos (generales y de cada proyecto), filtrables por estado, tema y proyecto.
- RF-6: EL SISTEMA muestra en la pestaña «Definición» de cada proyecto la sección «Aprendizajes» con los de ese proyecto, al administrador y al PM del proyecto; al PM no le muestra los que hablan del desempeño de una persona.
- RF-7: CADA aprendizaje se ve como tarjeta con tema, conclusión, evidencia, recomendación, estado, corte, origen y fecha, y permite marcarlo «Aplicada», «Descartada» o volverlo a «Propuesta». El administrador además puede editar el texto y eliminarlo (con el diálogo de confirmación de la app).

**Aprendizajes: generar**
- RF-8: EL SISTEMA ofrece «Generar aprendizajes» en la sección de un proyecto (administrador y PM) y en «Empresa» para los generales de un período (administrador). Usa la IA conectada y crea entre 3 y 7 aprendizajes en estado «Propuesta».
- RF-9: PARA generar, EL SISTEMA le entrega a la IA solo los indicadores calculados del alcance (proyecto o período), el perfil de la empresa y los aprendizajes que ya existen de ese alcance; la IA no consulta la base por su cuenta. Cada aprendizaje debe citar en su evidencia cifras de esos indicadores y no repetir uno existente.
- RF-10: EL SISTEMA ofrece en «Empresa → Aprendizajes» la «Retrospectiva de archivados»: lista los proyectos archivados sin aprendizajes, se marcan los que se quieren y se generan uno por uno mostrando el avance.
- RF-11: EL SISTEMA expone en la API los indicadores y los aprendizajes (leer, crear, cambiar estado, editar) con los mismos permisos, para que Claude los redacte a pedido; los que crea Claude quedan con origen «Claude».

**Avisos**
- RF-12: CUANDO se archiva un proyecto, se completan todas las tareas de una fase o empieza un mes, EL SISTEMA avisa por la campana a los administradores (y, si es de un proyecto, a su PM) que está listo para sacar aprendizajes, con el link a la sección. Un solo aviso por evento; nunca genera aprendizajes solo.

**Uso en el chat y los asistentes**
- RF-13: EL chat consulta los aprendizajes cuando la pregunta lo necesita (consejos, cómo mejorar, qué pasó en un proyecto), con los permisos de RF-5 y RF-6; los descartados no se usan como consejo.
- RF-14: LOS asistentes de proyectos y de tareas, al proponer fases, tiempos y pruebas, usan los aprendizajes (no descartados) de los proyectos parecidos y dicen de cuál salió cada uno.
- RF-15: EL chat responde sobre el rendimiento de las personas con el alcance de quien pregunta: administrador, todos; PM, solo en sus proyectos; miembro, solo el suyo.

**Errores**
- RF-16: SI no hay servicio de IA conectado, ENTONCES los botones de generar quedan deshabilitados con «Falta conectar un servicio de IA en Configuración → Bot»; el tablero y la lista funcionan igual.
- RF-17: SI la generación falla o no tiene saldo, ENTONCES EL SISTEMA lo dice en lenguaje simple y no guarda nada a medias.
- RF-18: SI alguien sin permiso entra a una sección o usa una acción, ENTONCES no ve nada y se le indica que no tiene acceso.

**Responsive y novedad**
- RF-19: Tablero y tarjetas en una columna en celular, sin scroll horizontal (las tablas anchas con scroll propio).
- RF-20: Avisos de novedad para «Tablero» y «Aprendizajes» en Empresa y para «Aprendizajes» en el proyecto (textos en el plan).

**Exportar y conectar con IA** (cambio de alcance 2026-11-06)
- RF-21: CADA aprendizaje no descartado tiene un check, con «Seleccionar todos» (de los que se ven con el filtro); un solo «Exportar» (y «Conectar IA») arriba trabaja con los seleccionados. Nunca incluye los descartados.
- RF-22: AL exportar, se elige el formato (Word, PDF, PowerPoint o texto .md) y la IA conectada arma un plan de mejora para el equipo o la gerencia: qué pasó con su evidencia, qué hacer, prioridad y responsable sugerido; el documento lleva la identidad de la empresa (salvo el .md) y se descarga.
- RF-23: EL SISTEMA ofrece «Conectar IA» para los seleccionados: un link con token, como el de proyectos y tareas, que entrega a una IA externa los aprendizajes con su evidencia, los indicadores del alcance e instrucciones para trabajarlos y marcarlos como aplicados por la API, con los permisos de quien creó el link.
- RF-24: EL link vence a los 7 días sin uso y se puede desactivar desde la app; uno vigente por persona y alcance.
- RF-25: SI la IA falla al exportar, ENTONCES EL SISTEMA lo dice en lenguaje simple y no descarga nada.

## Requisitos no funcionales
- Cada generación cuenta como una pregunta del tope mensual del bot.
- Textos visibles impersonales, sin jerga técnica.

## Casos límite
- Proyecto sin tareas completadas: los indicadores salen en «Sin datos» y la generación dice que no hay datos suficientes en lugar de inventar.
- Persona inactiva en un aprendizaje: se sigue mostrando su nombre.
- Proyecto eliminado: sus aprendizajes dejan de verse.
- Dos personas generan a la vez para el mismo proyecto: se guardan ambos lotes; quedan visibles para marcar o eliminar.

## Fuera de alcance
- Generar aprendizajes solo, sin que alguien lo pida.
- Avisos por WhatsApp de esta entrega.
- Indicadores nuevos que invente la IA o consultas libres a la base.
- Exportar el tablero.

## Criterios de finalización
- Los 20 RF verificados con `tsc`, lint y un chequeo `verify:learnings` que cubra los indicadores con datos de prueba, los permisos (RF-6, RF-15, RF-18) y que la generación rechace aprendizajes sin evidencia.
- Lo visual (gráficos, responsive) queda indicado como pendiente de prueba en navegador.

## Decisiones tomadas en la entrevista
- Quién redacta → las dos formas: botón en la app (IA conectada) y Claude por la API a pedido.
- Dónde → «Empresa» (todos) y cada proyecto en «Definición» (los suyos).
- Tablero → todos los indicadores, ordenados por lo que la empresa quiere revisar; filtros de período y cliente.
- Cuándo → aviso en la campana al archivar, al completar una fase y a fin de mes; nunca automático.
- Quién ve → administrador y PM del proyecto; lo individual solo administradores.
- Retrospectiva → elegir los archivados de una lista y generar uno por uno.
- Uso → chat y asistentes de proyectos y tareas; los descartados no.
- Avisos solo por campana (supuesto: evitar mensajes de WhatsApp de más).

## Cambios
- 2026-11-06 — Exportar y Conectar IA: un solo botón arriba que trabaja con los aprendizajes marcados con check (más «Seleccionar todos»), en vez de botones en cada tarjeta (pedido del usuario).
- 2026-11-06 — Exportar con IA (Word, PDF, PowerPoint, .md) y «Conectar IA» para los aprendizajes (RF-21 a RF-25), aprobado por el usuario.

## Dudas abiertas
(ninguna)
