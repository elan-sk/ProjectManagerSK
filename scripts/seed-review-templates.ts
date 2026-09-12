// Plantillas del sistema de Revisión (punto 2.6.4) — enfoque PSP ligero:
// detección de errores, calidad, cumplimiento, UX, patrones, mejora continua.
// Sin métricas de código (líneas, tiempo por línea, etc.).
//
// Contenido armado combinando (a) convenciones reales ya establecidas en
// otros proyectos del equipo (paleta de colores, naming en inglés,
// responsividad, reutilización de componentes, lenguaje formal, etc.) y
// (b) buenas prácticas estándar de testing/QA (WCAG, OWASP, heurísticas de
// Nielsen, clean code) — todo reescrito en lenguaje simple para que
// cualquiera del equipo, no solo quien programa, entienda qué verificar.
//
// Se puede correr más de una vez: reemplaza el contenido de la plantilla
// "General" y de las categorías de respuesta en vez de duplicarlas.
import { prisma } from "../src/lib/prisma";

type Check = { title: string; category: string; criteria: string[] };

const GENERAL_CHECKS: Check[] = [
  {
    title: "Hace lo que pedía la tarea",
    category: "Cumplimiento de requerimientos",
    criteria: [
      "El resultado cubre todo lo que pedía la tarea, sin faltar nada.",
      "No se agregó alcance de más que nadie pidió (o si se hizo, está avisado).",
      "Se probó el flujo completo de principio a fin con datos reales, no solo una parte.",
    ],
  },
  {
    title: "Extremos y límites probados",
    category: "Casos extremos y valores límite",
    criteria: [
      "Se probó con el valor mínimo y máximo permitido (ej. la fecha límite, el monto más alto).",
      "Se probó un valor apenas fuera del límite para confirmar que se rechaza.",
      "Se probó con una lista vacía, sin resultados, o sin conexión — y se ve bien, no roto.",
      "Se probó con bastante contenido (una lista larga, un texto largo) sin que se rompa el diseño.",
    ],
  },
  {
    title: "Rechaza datos inválidos con claridad",
    category: "Validaciones y datos inválidos",
    criteria: [
      "Los campos obligatorios vacíos muestran un aviso claro, no dejan pasar ni rompen la pantalla.",
      "Texto donde se espera un número, fechas imposibles, emails sin arroba: se rechazan con un mensaje entendible.",
      "La validación también se aplica del lado del servidor, no solo en el formulario.",
    ],
  },
  {
    title: "El flujo de decisiones da el resultado correcto",
    category: "Errores de lógica y comportamiento inesperado",
    criteria: [
      "Se probaron los distintos caminos posibles (no solo el más común) y todos dan el resultado esperado.",
      "Un cambio acá no rompió ni afectó otra pantalla o dato relacionado.",
      "Hacer doble clic o enviar dos veces no duplica la acción ni el registro.",
      "Ante un error, aparece un aviso claro — nunca una pantalla en blanco o la app trabada.",
    ],
  },
  {
    title: "Se ve y funciona bien en cualquier tamaño de pantalla",
    category: "Responsividad",
    criteria: [
      "Se probó en mobile, tablet y desktop — no solo estirando la ventana del navegador.",
      "No aparece scroll horizontal no intencional en ningún tamaño.",
      "El texto y las imágenes no se cortan, superponen ni se desbordan del contenedor.",
      "Los botones y links son fáciles de tocar con el dedo en mobile, sin quedar amontonados.",
      "Si el componente vive dentro de una columna o panel angosto, se adapta a ESE espacio, no al ancho total de la pantalla.",
    ],
  },
  {
    title: "Se puede usar solo con teclado",
    category: "Accesibilidad",
    criteria: [
      "Con la tecla Tab se llega a todos los botones, links y campos, en un orden lógico.",
      "Se ve con claridad cuál elemento está seleccionado al navegar con Tab.",
      "Un modal o popup se puede cerrar con la tecla Escape.",
    ],
  },
  {
    title: "Contraste y lectura para todos",
    category: "Accesibilidad",
    criteria: [
      "El texto tiene buen contraste contra el fondo (nada de gris clarito sobre blanco).",
      "Un error o estado no se comunica solo con color — también hay un ícono o una palabra.",
      "Las imágenes que aportan información tienen una descripción alternativa (alt).",
      "Cada campo de formulario tiene una etiqueta visible, no solo un placeholder que desaparece.",
    ],
  },
  {
    title: "Se entiende sin necesitar explicación",
    category: "Usabilidad",
    criteria: [
      "Alguien que lo usa por primera vez entiende qué hacer sin ayuda externa.",
      "Hay una salida clara (cancelar, volver, deshacer) antes de completar una acción.",
      "Antes de una acción que no se puede deshacer, se pide confirmación.",
      "Si algo falla, el mensaje explica en lenguaje simple qué pasó y qué hacer — sin códigos técnicos.",
    ],
  },
  {
    title: "Sigue la paleta y la escala del proyecto",
    category: "Consistencia visual y de diseño",
    criteria: [
      "No hay colores \"sueltos\" escritos a mano — todo color sale de la paleta ya definida.",
      "Los tamaños de texto y los espacios entre elementos siguen la escala ya usada en el resto de la app.",
      "El texto sigue siendo legible sin importar el color de fondo elegido (si el fondo se puede elegir).",
    ],
  },
  {
    title: "Coincide con el resto de la interfaz",
    category: "Consistencia visual y de diseño",
    criteria: [
      "Nombres, íconos, textos de botones y ubicación de acciones siguen el mismo patrón que el resto de la app.",
      "Las esquinas, alineación y espaciado coinciden con el diseño real, no se copiaron \"a ojo\" de otro componente parecido.",
    ],
  },
  {
    title: "Nombres claros, completos y en inglés",
    category: "Convenciones de código y naming",
    criteria: [
      "Variables, funciones y archivos tienen nombres en inglés que explican qué son sin abrir el código.",
      "No hay abreviaturas (ej. \"quantity\" en vez de \"qty\").",
      "No hay números sueltos en nombres de archivo (ej. \"StepInputs\" en vez de \"Step1Inputs\").",
    ],
  },
  {
    title: "Sin código muerto ni duplicado",
    category: "Convenciones de código y naming",
    criteria: [
      "No quedan funciones, imports o bloques de código comentados sin usar.",
      "La misma lógica no está copiada y pegada en dos lugares — está compartida.",
      "El estilo (naming, estructura, patrones) sigue el mismo que ya existe en el proyecto.",
    ],
  },
  {
    title: "Componentes reusados, no reinventados",
    category: "Reutilización y estructura de componentes",
    criteria: [
      "Antes de crear algo nuevo, se revisó si ya existe un componente o patrón que sirva.",
      "Un ajuste puntual se resolvió localmente, sin modificar un componente compartido que usan otras pantallas.",
      "El contenido que se repite (tarjetas, filas de lista) está en su propio componente, no mezclado con el layout general.",
    ],
  },
  {
    title: "Nadie ve ni edita datos de otro usuario",
    category: "Seguridad",
    criteria: [
      "Cambiar un ID en la URL no permite ver ni editar información de otra cuenta o proyecto.",
      "Cada acción se vuelve a verificar en el servidor, no confía solo en lo que manda la pantalla.",
      "No hay contraseñas, tokens ni claves escritas directamente en el código.",
    ],
  },
  {
    title: "No se expone información de más",
    category: "Seguridad",
    criteria: [
      "Las respuestas del servidor no incluyen datos que la pantalla no necesita (contraseñas, tokens de otros usuarios).",
      "Un error nunca muestra detalles técnicos internos (rutas del servidor, nombres de tablas) al usuario final.",
      "No se puede entrar a una pantalla protegida escribiendo la URL directamente sin haber iniciado sesión.",
    ],
  },
  {
    title: "Responde rápido y no bloquea la pantalla",
    category: "Rendimiento",
    criteria: [
      "Las acciones comunes (guardar, filtrar, abrir un detalle) responden en menos de 1 segundo en condiciones normales.",
      "Mientras algo carga, se ve un indicador (spinner o similar) — nunca una pantalla trabada sin aviso.",
      "Un botón de enviar se deshabilita mientras procesa, para que no se pueda hacer doble clic.",
      "No se repiten peticiones al servidor que ya se habían hecho (ej. al volver a una pestaña).",
    ],
  },
  {
    title: "Comentarios solo donde hacen falta",
    category: "Comentarios y documentación",
    criteria: [
      "No hay comentarios explicando \"qué hace\" el código línea por línea — se explica solo con buenos nombres.",
      "Si hay un comentario, es porque hay un detalle crítico que rompería algo si no se supiera.",
    ],
  },
  {
    title: "Simple, formal y sin detalles técnicos",
    category: "Lenguaje para el usuario final",
    criteria: [
      "Los textos que ve el usuario (botones, mensajes, ayuda) usan lenguaje simple, sin jerga de programador.",
      "Se usa un trato formal (usted), no tuteo/voseo, en todo texto visible para el cliente.",
      "Ningún mensaje menciona detalles de implementación ni que \"antes fallaba y se corrigió\".",
    ],
  },
];

const RESPONSE_CATEGORIES: { name: string; responses: string[] }[] = [
  { name: "Cumplimiento de requerimientos", responses: ["Ajustado para cubrir el alcance pedido.", "Agregada la parte del requerimiento que faltaba."] },
  { name: "Casos extremos y valores límite", responses: ["Agregado el manejo del caso límite señalado.", "Cubierto el caso con lista vacía o sin datos."] },
  { name: "Validaciones y datos inválidos", responses: ["Agregada la validación faltante con su mensaje de error.", "Agregada también la validación del lado del servidor."] },
  { name: "Errores de lógica y comportamiento inesperado", responses: ["Corregida la condición o cálculo según la especificación.", "Corregido el efecto secundario no deseado.", "Eliminada la duplicación de la acción."] },
  { name: "Responsividad", responses: ["Ajustado el layout para que no rompa en ese tamaño.", "Corregido para que se adapte al ancho real del contenedor, no de la pantalla completa."] },
  { name: "Accesibilidad", responses: ["Agregado el foco, etiquetado o contraste faltante.", "Ahora se puede completar solo con teclado."] },
  { name: "Usabilidad", responses: ["Simplificado el flujo o el texto para que sea más claro.", "Agregada la confirmación antes de la acción irreversible."] },
  { name: "Consistencia visual y de diseño", responses: ["Reemplazado el color suelto por el de la paleta del proyecto.", "Ajustado el tamaño o espaciado a la escala ya usada."] },
  { name: "Convenciones de código y naming", responses: ["Renombrado siguiendo la convención ya usada en el proyecto.", "Traducidos los nombres a inglés o quitadas las abreviaturas."] },
  { name: "Reutilización y estructura de componentes", responses: ["Reemplazado por el componente ya existente en vez de uno nuevo.", "Movido el ajuste puntual a un override local, sin tocar el componente compartido."] },
  { name: "Seguridad", responses: ["Agregada la verificación de permisos en el servidor.", "Quitada la información sensible de la respuesta o del código."] },
  { name: "Rendimiento", responses: ["Optimizada la consulta o el render que causaba la lentitud.", "Evitada la petición duplicada al servidor."] },
  { name: "Comentarios y documentación", responses: ["Quitados los comentarios innecesarios.", "Agregado el comentario solo donde había un detalle crítico."] },
  { name: "Lenguaje para el usuario final", responses: ["Reescrito el texto en lenguaje simple, sin jerga técnica.", "Corregido el trato a formal (usted)."] },
  { name: "Otro", responses: ["Ya corregido en un cambio anterior — verificar de nuevo.", "No aplica — ver nota en el hilo de la ronda."] },
];

async function main() {
  const existing = await prisma.testTemplate.findFirst({ where: { name: "General" } });
  if (existing) {
    await prisma.testTemplateItem.deleteMany({ where: { templateId: existing.id } });
  }
  const template = existing ?? (await prisma.testTemplate.create({ data: { name: "General" } }));
  await prisma.testTemplateItem.createMany({
    data: GENERAL_CHECKS.map((c, i) => ({
      templateId: template.id,
      title: c.title,
      category: c.category,
      criteria: c.criteria.join("\n"),
      order: i,
    })),
  });
  console.log(`Plantilla "General" actualizada con ${GENERAL_CHECKS.length} pruebas.`);

  for (const cat of RESPONSE_CATEGORIES) {
    const existingCat = await prisma.responseCategory.findFirst({ where: { name: cat.name } });
    if (existingCat) {
      await prisma.responseTemplate.deleteMany({ where: { categoryId: existingCat.id } });
      await prisma.responseTemplate.createMany({ data: cat.responses.map((text) => ({ categoryId: existingCat.id, text })) });
    } else {
      await prisma.responseCategory.create({
        data: { name: cat.name, responses: { create: cat.responses.map((text) => ({ text })) } },
      });
    }
  }

  // Categorías viejas que ya no forman parte de la lista nueva (renombradas
  // o fusionadas) — se eliminan para no dejar duplicados obsoletos.
  const currentNames = RESPONSE_CATEGORIES.map((c) => c.name);
  const stale = await prisma.responseCategory.findMany({ where: { name: { notIn: currentNames } } });
  if (stale.length > 0) {
    await prisma.responseCategory.deleteMany({ where: { id: { in: stale.map((c) => c.id) } } });
    console.log(`Eliminadas ${stale.length} categorías obsoletas: ${stale.map((c) => c.name).join(", ")}`);
  }

  console.log(`Categorías de respuesta actualizadas (${RESPONSE_CATEGORIES.length}).`);
}

main().then(() => process.exit(0));
