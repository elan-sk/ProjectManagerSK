INSERT INTO `TestTemplate` (id, name, createdAt) VALUES ('cmtv7dm9r0000cwtfrd0esfyt', 'General', '2026-09-10 07:25:42.015');
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o00001etfzo9aswwh', 'cmtv7dm9r0000cwtfrd0esfyt', 'Hace exactamente lo que pedía la tarea', 'El resultado cubre todo lo que pedía la tarea, sin faltar nada.
No se agregó alcance de más que nadie pidió (o si se hizo, está avisado).
Se probó el flujo completo de principio a fin con datos reales, no solo una parte.', 'Cumplimiento de requerimientos', 0);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o00011etf55rrw80q', 'cmtv7dm9r0000cwtfrd0esfyt', 'Extremos y límites probados', 'Se probó con el valor mínimo y máximo permitido (ej. la fecha límite, el monto más alto).
Se probó un valor apenas fuera del límite para confirmar que se rechaza.
Se probó con una lista vacía, sin resultados, o sin conexión — y se ve bien, no roto.
Se probó con bastante contenido (una lista larga, un texto largo) sin que se rompa el diseño.', 'Casos extremos y valores límite', 1);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o00021etfjio1y42t', 'cmtv7dm9r0000cwtfrd0esfyt', 'Rechaza datos inválidos con claridad', 'Los campos obligatorios vacíos muestran un aviso claro, no dejan pasar ni rompen la pantalla.
Texto donde se espera un número, fechas imposibles, emails sin arroba: se rechazan con un mensaje entendible.
La validación también se aplica del lado del servidor, no solo en el formulario.', 'Validaciones y datos inválidos', 2);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o00031etfdyz8vvbe', 'cmtv7dm9r0000cwtfrd0esfyt', 'El flujo de decisiones da el resultado correcto', 'Se probaron los distintos caminos posibles (no solo el más común) y todos dan el resultado esperado.
Un cambio acá no rompió ni afectó otra pantalla o dato relacionado.
Hacer doble clic o enviar dos veces no duplica la acción ni el registro.
Ante un error, aparece un aviso claro — nunca una pantalla en blanco o la app trabada.', 'Errores de lógica y comportamiento inesperado', 3);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o00041etfzw78rb8w', 'cmtv7dm9r0000cwtfrd0esfyt', 'Se ve y funciona bien en cualquier tamaño de pantalla', 'Se probó en mobile, tablet y desktop — no solo estirando la ventana del navegador.
No aparece scroll horizontal no intencional en ningún tamaño.
El texto y las imágenes no se cortan, superponen ni se desbordan del contenedor.
Los botones y links son fáciles de tocar con el dedo en mobile, sin quedar amontonados.
Si el componente vive dentro de una columna o panel angosto, se adapta a ESE espacio, no al ancho total de la pantalla.', 'Responsividad', 4);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o00051etfzlegofjt', 'cmtv7dm9r0000cwtfrd0esfyt', 'Se puede usar solo con teclado', 'Con la tecla Tab se llega a todos los botones, links y campos, en un orden lógico.
Se ve con claridad cuál elemento está seleccionado al navegar con Tab.
Un modal o popup se puede cerrar con la tecla Escape.', 'Accesibilidad', 5);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o00061etfxglexfxc', 'cmtv7dm9r0000cwtfrd0esfyt', 'Contraste y lectura para todos', 'El texto tiene buen contraste contra el fondo (nada de gris clarito sobre blanco).
Un error o estado no se comunica solo con color — también hay un ícono o una palabra.
Las imágenes que aportan información tienen una descripción alternativa (alt).
Cada campo de formulario tiene una etiqueta visible, no solo un placeholder que desaparece.', 'Accesibilidad', 6);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o00071etffkvw0gyt', 'cmtv7dm9r0000cwtfrd0esfyt', 'Se entiende sin necesitar explicación', 'Alguien que lo usa por primera vez entiende qué hacer sin ayuda externa.
Hay una salida clara (cancelar, volver, deshacer) antes de completar una acción.
Antes de una acción que no se puede deshacer, se pide confirmación.
Si algo falla, el mensaje explica en lenguaje simple qué pasó y qué hacer — sin códigos técnicos.', 'Usabilidad', 7);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o00081etfggts6qes', 'cmtv7dm9r0000cwtfrd0esfyt', 'Sigue la paleta y la escala del proyecto', 'No hay colores "sueltos" escritos a mano — todo color sale de la paleta ya definida.
Los tamaños de texto y los espacios entre elementos siguen la escala ya usada en el resto de la app.
El texto sigue siendo legible sin importar el color de fondo elegido (si el fondo se puede elegir).', 'Consistencia visual y de diseño', 8);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o00091etfp5jm6em8', 'cmtv7dm9r0000cwtfrd0esfyt', 'Coincide con el resto de la interfaz', 'Nombres, íconos, textos de botones y ubicación de acciones siguen el mismo patrón que el resto de la app.
Las esquinas, alineación y espaciado coinciden con el diseño real, no se copiaron "a ojo" de otro componente parecido.', 'Consistencia visual y de diseño', 9);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o000a1etfdsgiioi3', 'cmtv7dm9r0000cwtfrd0esfyt', 'Nombres claros, completos y en inglés', 'Variables, funciones y archivos tienen nombres en inglés que explican qué son sin abrir el código.
No hay abreviaturas (ej. "quantity" en vez de "qty").
No hay números sueltos en nombres de archivo (ej. "StepInputs" en vez de "Step1Inputs").', 'Convenciones de código y naming', 10);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o000b1etffmcg32jq', 'cmtv7dm9r0000cwtfrd0esfyt', 'Sin código muerto ni duplicado', 'No quedan funciones, imports o bloques de código comentados sin usar.
La misma lógica no está copiada y pegada en dos lugares — está compartida.
El estilo (naming, estructura, patrones) sigue el mismo que ya existe en el proyecto.', 'Convenciones de código y naming', 11);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o000c1etfo0u95rif', 'cmtv7dm9r0000cwtfrd0esfyt', 'Componentes reusados, no reinventados', 'Antes de crear algo nuevo, se revisó si ya existe un componente o patrón que sirva.
Un ajuste puntual se resolvió localmente, sin modificar un componente compartido que usan otras pantallas.
El contenido que se repite (tarjetas, filas de lista) está en su propio componente, no mezclado con el layout general.', 'Reutilización y estructura de componentes', 12);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o000d1etf46w70crt', 'cmtv7dm9r0000cwtfrd0esfyt', 'Nadie ve ni edita datos de otro usuario', 'Cambiar un ID en la URL no permite ver ni editar información de otra cuenta o proyecto.
Cada acción se vuelve a verificar en el servidor, no confía solo en lo que manda la pantalla.
No hay contraseñas, tokens ni claves escritas directamente en el código.', 'Seguridad', 13);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o000e1etfhi5jz0se', 'cmtv7dm9r0000cwtfrd0esfyt', 'No se expone información de más', 'Las respuestas del servidor no incluyen datos que la pantalla no necesita (contraseñas, tokens de otros usuarios).
Un error nunca muestra detalles técnicos internos (rutas del servidor, nombres de tablas) al usuario final.
No se puede entrar a una pantalla protegida escribiendo la URL directamente sin haber iniciado sesión.', 'Seguridad', 14);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o000f1etfqfm6f2n1', 'cmtv7dm9r0000cwtfrd0esfyt', 'Responde rápido y no bloquea la pantalla', 'Las acciones comunes (guardar, filtrar, abrir un detalle) responden en menos de 1 segundo en condiciones normales.
Mientras algo carga, se ve un indicador (spinner o similar) — nunca una pantalla trabada sin aviso.
Un botón de enviar se deshabilita mientras procesa, para que no se pueda hacer doble clic.
No se repiten peticiones al servidor que ya se habían hecho (ej. al volver a una pestaña).', 'Rendimiento', 15);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o000g1etfri0d7q0o', 'cmtv7dm9r0000cwtfrd0esfyt', 'Comentarios solo donde hacen falta', 'No hay comentarios explicando "qué hace" el código línea por línea — se explica solo con buenos nombres.
Si hay un comentario, es porque hay un detalle crítico que rompería algo si no se supiera.', 'Comentarios y documentación', 16);
INSERT INTO `TestTemplateItem` (id, templateId, description, criteria, category, `order`) VALUES ('cmtvx6o0o000h1etfb3tnbyw8', 'cmtv7dm9r0000cwtfrd0esfyt', 'Simple, formal y sin detalles técnicos', 'Los textos que ve el usuario (botones, mensajes, ayuda) usan lenguaje simple, sin jerga de programador.
Se usa un trato formal (usted), no tuteo/voseo, en todo texto visible para el cliente.
Ningún mensaje menciona detalles de implementación ni que "antes fallaba y se corrigió".', 'Lenguaje para el usuario final', 17);
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtv7dmbp0012cwtfb2754ds7', 'Otro');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o1v000i1etfk4go5wem', 'Cumplimiento de requerimientos');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o29000l1etfkmhiaxvd', 'Casos extremos y valores límite');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o2j000o1etfmjigopio', 'Validaciones y datos inválidos');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o2v000r1etfphme4ota', 'Errores de lógica y comportamiento inesperado');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o34000v1etf63qi596s', 'Responsividad');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o3g000y1etfl98l3db7', 'Accesibilidad');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o3o00111etfnk8bvt73', 'Usabilidad');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o3y00141etf9vjhd3tv', 'Consistencia visual y de diseño');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o4e00171etff20xmcfp', 'Convenciones de código y naming');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o4m001a1etfxxe8j383', 'Reutilización y estructura de componentes');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o4t001d1etff4bd1dbe', 'Seguridad');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o53001g1etfkei9l4bi', 'Rendimiento');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o5a001j1etf6ypi2fjs', 'Comentarios y documentación');
INSERT INTO `ResponseCategory` (id, name) VALUES ('cmtvx6o5g001m1etfhuu21i2e', 'Lenguaje para el usuario final');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o1w000j1etf0rbmff67', 'cmtvx6o1v000i1etfk4go5wem', 'Ajustado para cubrir el alcance pedido.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o1x000k1etfc1jw9rnp', 'cmtvx6o1v000i1etfk4go5wem', 'Agregada la parte del requerimiento que faltaba.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o2a000m1etf9gfou3qd', 'cmtvx6o29000l1etfkmhiaxvd', 'Agregado el manejo del caso límite señalado.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o2a000n1etffa4pgmiu', 'cmtvx6o29000l1etfkmhiaxvd', 'Cubierto el caso con lista vacía o sin datos.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o2k000p1etf18kxwgd2', 'cmtvx6o2j000o1etfmjigopio', 'Agregada la validación faltante con su mensaje de error.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o2k000q1etfzqnvl492', 'cmtvx6o2j000o1etfmjigopio', 'Agregada también la validación del lado del servidor.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o2w000s1etfv6l0ywk3', 'cmtvx6o2v000r1etfphme4ota', 'Corregida la condición o cálculo según la especificación.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o2w000t1etf9c6k2n8m', 'cmtvx6o2v000r1etfphme4ota', 'Corregido el efecto secundario no deseado.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o2w000u1etf65oafzul', 'cmtvx6o2v000r1etfphme4ota', 'Eliminada la duplicación de la acción.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o35000w1etfoctm1bkk', 'cmtvx6o34000v1etf63qi596s', 'Ajustado el layout para que no rompa en ese tamaño.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o35000x1etfrxbf7b7b', 'cmtvx6o34000v1etf63qi596s', 'Corregido para que se adapte al ancho real del contenedor, no de la pantalla completa.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o3g000z1etfyfpyx075', 'cmtvx6o3g000y1etfl98l3db7', 'Agregado el foco, etiquetado o contraste faltante.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o3g00101etflapnn36v', 'cmtvx6o3g000y1etfl98l3db7', 'Ahora se puede completar solo con teclado.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o3p00121etfqjd9xers', 'cmtvx6o3o00111etfnk8bvt73', 'Simplificado el flujo o el texto para que sea más claro.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o3p00131etfwim84ppl', 'cmtvx6o3o00111etfnk8bvt73', 'Agregada la confirmación antes de la acción irreversible.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o4100151etf8jlvy7rf', 'cmtvx6o3y00141etf9vjhd3tv', 'Reemplazado el color suelto por el de la paleta del proyecto.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o4100161etfly1gyqn4', 'cmtvx6o3y00141etf9vjhd3tv', 'Ajustado el tamaño o espaciado a la escala ya usada.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o4f00181etffd7b1ojd', 'cmtvx6o4e00171etff20xmcfp', 'Renombrado siguiendo la convención ya usada en el proyecto.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o4f00191etfts59fd6b', 'cmtvx6o4e00171etff20xmcfp', 'Traducidos los nombres a inglés o quitadas las abreviaturas.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o4m001b1etfuxv9fvwg', 'cmtvx6o4m001a1etfxxe8j383', 'Reemplazado por el componente ya existente en vez de uno nuevo.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o4m001c1etfsjjd09w2', 'cmtvx6o4m001a1etfxxe8j383', 'Movido el ajuste puntual a un override local, sin tocar el componente compartido.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o4v001e1etfq1j27rlw', 'cmtvx6o4t001d1etff4bd1dbe', 'Agregada la verificación de permisos en el servidor.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o4v001f1etfyiq10vnh', 'cmtvx6o4t001d1etff4bd1dbe', 'Quitada la información sensible de la respuesta o del código.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o54001h1etfku5l5gmo', 'cmtvx6o53001g1etfkei9l4bi', 'Optimizada la consulta o el render que causaba la lentitud.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o54001i1etf49fr67cy', 'cmtvx6o53001g1etfkei9l4bi', 'Evitada la petición duplicada al servidor.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o5a001k1etfsiu9tk9l', 'cmtvx6o5a001j1etf6ypi2fjs', 'Quitados los comentarios innecesarios.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o5a001l1etfet9dyssw', 'cmtvx6o5a001j1etf6ypi2fjs', 'Agregado el comentario solo donde había un detalle crítico.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o5h001n1etf8yu86tsf', 'cmtvx6o5g001m1etfhuu21i2e', 'Reescrito el texto en lenguaje simple, sin jerga técnica.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o5h001o1etfrp7stkmr', 'cmtvx6o5g001m1etfhuu21i2e', 'Corregido el trato a formal (usted).');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o5u001p1etfu3yk6dnc', 'cmtv7dmbp0012cwtfb2754ds7', 'Ya corregido en un cambio anterior — verificar de nuevo.');
INSERT INTO `ResponseTemplate` (id, categoryId, text) VALUES ('cmtvx6o5u001q1etf1ayrieo2', 'cmtv7dmbp0012cwtfb2754ds7', 'No aplica — ver nota en el hilo de la ronda.');
