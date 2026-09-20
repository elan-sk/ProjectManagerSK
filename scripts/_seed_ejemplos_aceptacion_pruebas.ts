// Ejemplos para probar los hilos, imágenes y preguntas en tareas de Aceptación
// y de Pruebas (QA). Crea dos tareas "[Ejemplo] …" en el proyecto __F2 Proyecto__
// con interacciones inventadas (cliente externo + equipo). Se puede volver a
// correr: borra primero las tareas "[Ejemplo] …" que dejó una corrida anterior.
//   npx tsx scripts/_seed_ejemplos_aceptacion_pruebas.ts
import { prisma } from "../src/lib/prisma";
import { generateShareToken } from "../src/lib/shareLinks";
import { imageMarker, mentionMarker } from "../src/lib/commentBody";

const PROJECT_ID = "cmu8viols00026utfiodse6qp";
const PHASE_ID = "cmu8violw00036utfsskd2bq1";
// Personas del equipo (usuarios reales de la base local).
const ELAN = "cmu8mj9v30002totfprrygv5s";
const LINA = "cmu8mj9vk0003totf1cj05ev6";
const NATA = "cmu8mj9vv0004totfl11vq3gd";
const ALEJANDRO = "cmu8mj9t70000totf4umedeil";
const DAVID = "cmu8mj9ue0001totf3rsr67n9";

const IMG = {
  logo: { url: "/uploads/f476ec86-80d1-4b47-aeb7-58c8e61ebfd2.png", name: "logo-pixelado.png", mimeType: "image/png" },
  afiche: { url: "/uploads/d5ac004d-ed45-414a-9268-264c4a065723.jpeg", name: "referencia-afiche.jpeg", mimeType: "image/jpeg" },
  render: { url: "/uploads/9b8336c2-37aa-40d6-92b2-308f20356501.jpeg", name: "propuesta-galeria.jpeg", mimeType: "image/jpeg" },
  captura1: { url: "/uploads/79710ee7-f51e-4086-bb14-77c0f8d1b9e3.png", name: "captura-error-correo.png", mimeType: "image/png" },
  captura2: { url: "/uploads/bee7c480-2490-4ba7-81d9-5125d319fa19.png", name: "captura-telefono.png", mimeType: "image/png" },
  captura3: { url: "/uploads/0a703af9-c732-474b-bca9-2a4d008a4ed1.png", name: "captura-movil.png", mimeType: "image/png" },
};
type Img = (typeof IMG)[keyof typeof IMG];

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
let clock = Date.now() - 1000 * 60 * 60 * 30; // las interacciones se reparten en las últimas ~30 h
const tick = (minutes = 25) => new Date((clock += minutes * 60_000));

async function cleanPrevious() {
  await prisma.internalMessage.deleteMany({ where: { projectId: PROJECT_ID, taskId: null, body: { startsWith: "[Ejemplo]" } } });
  await prisma.shareComment.deleteMany({ where: { projectId: PROJECT_ID, taskId: null, body: { startsWith: "[Ejemplo]" } } });
  const old = await prisma.task.findMany({ where: { projectId: PROJECT_ID, title: { startsWith: "[Ejemplo]" } }, select: { id: true } });
  if (old.length) await prisma.task.deleteMany({ where: { id: { in: old.map((t) => t.id) } } });
  return old.length;
}

async function newTask(title: string, type: "ACCEPTANCE" | "QA", description: string, assignees: string[], reviewers: string[] = []) {
  const task = await prisma.task.create({
    data: {
      projectId: PROJECT_ID,
      phaseId: PHASE_ID,
      type,
      title,
      description,
      status: "IN_PROGRESS",
      plannedStart: day("2026-09-21"),
      plannedEnd: day("2026-09-30"),
      assignees: { create: assignees.map((userId) => ({ userId })) },
      reviewers: { create: reviewers.map((userId) => ({ userId })) },
    },
  });
  const link = await prisma.shareLink.create({ data: { token: generateShareToken(), targetType: "TASK", taskId: task.id, createdById: ELAN } });
  return { task, token: link.token };
}

type Voter = { userId?: string; name?: string; role?: string };
async function addVotes(pollId: string, options: { id: string; label: string }[], votes: { who: Voter; options: string[] }[]) {
  for (const v of votes) {
    const voterKey = v.who.userId ? `u:${v.who.userId}` : `e:${(v.who.name ?? "").toLowerCase()}`;
    for (const label of v.options) {
      const option = options.find((o) => o.label === label)!;
      await prisma.sharePollVote.create({
        data: { pollId, optionId: option.id, voterKey, userId: v.who.userId ?? null, externalName: v.who.name ?? null, externalRole: v.who.role ?? null },
      });
    }
  }
}

// Comentario del hilo compartido (cliente o equipo), con imágenes como INSUMO y/o pregunta.
async function comment(
  taskId: string,
  a: {
    who: { userId: string; name: string } | { name: string; role: string };
    body: string;
    reviewCheckId?: string;
    parentId?: string;
    images?: Img[];
    poll?: { multiple: boolean; closed?: boolean; options: string[]; votes: { who: Voter; options: string[] }[] };
  }
) {
  const team = "userId" in a.who;
  const c = await prisma.shareComment.create({
    data: {
      taskId,
      reviewCheckId: a.reviewCheckId ?? null,
      parentId: a.parentId ?? null,
      authorName: a.who.name,
      authorRole: team ? "Equipo" : (a.who as { role: string }).role,
      authorUserId: team ? (a.who as { userId: string }).userId : null,
      body: a.body,
      createdAt: tick(),
      ...(a.poll
        ? { poll: { create: { multiple: a.poll.multiple, closed: a.poll.closed ?? false, options: { create: a.poll.options.map((label, order) => ({ label, order })) } } } }
        : {}),
    },
    include: { poll: { include: { options: true } } },
  });
  for (const img of a.images ?? []) {
    await prisma.attachment.create({
      data: {
        taskId,
        kind: "INSUMO",
        fileUrl: img.url,
        fileName: img.name,
        mimeType: img.mimeType,
        shareCommentId: c.id,
        ...(team
          ? { uploadedById: (a.who as { userId: string }).userId }
          : { externalUploaderName: a.who.name, externalUploaderRole: (a.who as { role: string }).role }),
      },
    });
  }
  if (a.poll && c.poll) await addVotes(c.poll.id, c.poll.options, a.poll.votes);
  return c;
}

// Mensaje del hilo interno de una ronda (solo equipo).
async function roundMessage(
  reviewRoundId: string,
  a: { userId: string; body: string; images?: Img[]; poll?: { multiple: boolean; closed?: boolean; options: string[]; votes: { who: Voter; options: string[] }[] } }
) {
  const m = await prisma.reviewMessage.create({
    data: {
      reviewRoundId,
      authorId: a.userId,
      body: a.body,
      createdAt: tick(),
      attachments: { create: (a.images ?? []).map((i) => ({ fileUrl: i.url, fileName: i.name, mimeType: i.mimeType })) },
      ...(a.poll
        ? { poll: { create: { multiple: a.poll.multiple, closed: a.poll.closed ?? false, options: { create: a.poll.options.map((label, order) => ({ label, order })) } } } }
        : {}),
    },
    include: { poll: { include: { options: true } } },
  });
  if (a.poll && m.poll) await addVotes(m.poll.id, m.poll.options, a.poll.votes);
}


const NAMES: Record<string, string> = { [ELAN]: "Elan", [LINA]: "Lina", [NATA]: "Nata", [ALEJANDRO]: "Alejandro", [DAVID]: "David Hoyos" };
const at = (id: string) => mentionMarker(id, NAMES[id]);

// Mensaje del hilo interno de UNA prueba: texto con @menciones e imágenes, y/o pregunta.
// Se inserta directo en la base a propósito: así no sale ningún aviso por WhatsApp.
async function checkMessage(
  taskId: string,
  reviewCheckId: string,
  a: { userId: string; body: string; mentions?: string[]; poll?: { multiple: boolean; closed?: boolean; options: string[]; votes: { who: Voter; options: string[] }[] } }
) {
  const m = await prisma.internalMessage.create({
    data: {
      projectId: PROJECT_ID,
      taskId,
      reviewCheckId,
      authorId: a.userId,
      body: a.body,
      createdAt: tick(),
      reads: { create: { userId: a.userId } },
      mentions: { create: (a.mentions ?? []).map((userId) => ({ userId })) },
      ...(a.poll
        ? { poll: { create: { multiple: a.poll.multiple, closed: a.poll.closed ?? false, options: { create: a.poll.options.map((label, order) => ({ label, order })) } } } }
        : {}),
    },
    include: { poll: { include: { options: true } } },
  });
  if (a.poll && m.poll) await addVotes(m.poll.id, m.poll.options, a.poll.votes);
}

const MARIA = { name: "María Gómez", role: "Gerente de Marca" };
const CARLOS = { name: "Carlos Ruiz", role: "Director Comercial" };

async function seedAcceptance() {
  const { task, token } = await newTask(
    "[Ejemplo] Aceptación — Sitio web corporativo",
    "ACCEPTANCE",
    "<p>Entrega del sitio web corporativo para aceptación por el cliente. Cada característica se acepta o se devuelve desde el link.</p>",
    [ELAN, LINA]
  );

  // ── Ronda 1 (cerrada, devuelta): tres características ya calificadas ──
  const r1 = await prisma.reviewRound.create({
    data: { taskId: task.id, roundNumber: 1, submittedById: LINA, submittedAt: tick(), outcome: "RETURNED", closedAt: tick(200) },
  });
  await prisma.reviewDeliverable.create({ data: { reviewRoundId: r1.id, fileUrl: IMG.afiche.url, fileName: "Vista previa del sitio.jpeg", mimeType: IMG.afiche.mimeType } });
  const c1 = await prisma.reviewCheck.create({
    data: { reviewRoundId: r1.id, order: 0, title: "Diseño de la portada", criteria: "Logo visible\nColores de la marca\nBotón de contacto arriba", result: "APPROVED", externalReviewerName: MARIA.name, externalReviewerRole: MARIA.role },
  });
  const c2 = await prisma.reviewCheck.create({
    data: {
      reviewRoundId: r1.id,
      order: 1,
      title: "Sección «Nosotros»",
      criteria: "Texto aprobado por dirección\nLogo en alta resolución",
      result: "FAILED",
      note: "El texto no coincide con el aprobado y el logo se ve pixelado.",
      externalReviewerName: MARIA.name,
      externalReviewerRole: MARIA.role,
    },
  });
  await prisma.reviewCheck.create({
    data: { reviewRoundId: r1.id, order: 2, title: "Formulario de contacto", result: "APPROVED", externalReviewerName: CARLOS.name, externalReviewerRole: CARLOS.role },
  });

  // Hilo de «Sección Nosotros» de la ronda 1: el cliente comentó antes de devolverla (hoy queda de solo lectura).
  const t1 = await comment(task.id, { who: MARIA, reviewCheckId: c2.id, body: "El logo se ve pixelado en la portada de esta sección. Adjunto cómo lo estoy viendo.", images: [IMG.logo] });
  await comment(task.id, { who: { userId: LINA, name: "Lina" }, reviewCheckId: c2.id, parentId: t1.id, body: "Gracias, María. Ya pedimos el logo vectorial para reemplazarlo." });
  await comment(task.id, { who: MARIA, reviewCheckId: c2.id, body: "Perfecto. Además el texto de «Misión» debe ser el del documento de la reunión del lunes." });

  // Hilo interno de la ronda 1
  await roundMessage(r1.id, { userId: ELAN, body: "El cliente devolvió «Nosotros». Antes de la ronda 2 hay que resolver el logo y el texto.", images: [IMG.logo] });
  await roundMessage(r1.id, {
    userId: LINA,
    body: "¿Qué corregimos primero para la ronda 2?",
    poll: {
      multiple: true,
      options: ["Reemplazar el logo", "Actualizar el texto de Misión", "Revisar la versión móvil", "Optimizar las imágenes"],
      votes: [
        { who: { userId: ELAN }, options: ["Reemplazar el logo", "Actualizar el texto de Misión"] },
        { who: { userId: LINA }, options: ["Reemplazar el logo", "Revisar la versión móvil"] },
        { who: { userId: NATA }, options: ["Actualizar el texto de Misión"] },
      ],
    },
  });

  // ── Ronda 2 (activa): características pendientes de calificar ──
  const r2 = await prisma.reviewRound.create({ data: { taskId: task.id, roundNumber: 2, submittedById: LINA, submittedAt: tick(60) } });
  await prisma.reviewDeliverable.create({ data: { reviewRoundId: r2.id, fileUrl: IMG.render.url, fileName: "Vista previa ronda 2.jpeg", mimeType: IMG.render.mimeType } });
  const d1 = await prisma.reviewCheck.create({ data: { reviewRoundId: r2.id, order: 0, title: "Sección «Nosotros» (corregida)", criteria: "Logo vectorial\nTexto de Misión actualizado" } });
  const d2 = await prisma.reviewCheck.create({ data: { reviewRoundId: r2.id, order: 1, title: "Galería de proyectos", criteria: "Mínimo 8 fotos\nAmpliación al hacer clic" } });
  const d3 = await prisma.reviewCheck.create({ data: { reviewRoundId: r2.id, order: 2, title: "Versión móvil", criteria: "Menú desplegable\nTextos legibles" } });
  await prisma.reviewCheck.create({ data: { reviewRoundId: r2.id, order: 3, title: "Pie de página y datos legales" } });

  // Hilos por característica (abiertos: el cliente todavía puede comentar)
  const g1 = await comment(task.id, { who: MARIA, reviewCheckId: d2.id, body: "¿La galería puede tener más de 8 fotos? Adjunto la referencia que me gustó.", images: [IMG.render] });
  await comment(task.id, { who: { userId: LINA, name: "Lina" }, reviewCheckId: d2.id, parentId: g1.id, body: "Sí, admite hasta 24. Queda listo para que la revise." });
  await comment(task.id, {
    who: { userId: ELAN, name: "Elan" },
    reviewCheckId: d2.id,
    body: "¿Qué disposición prefieren para la galería?",
    poll: {
      multiple: false,
      options: ["Cuadrícula uniforme", "Carrusel horizontal", "Mosaico con fotos grandes"],
      votes: [
        { who: { name: MARIA.name, role: MARIA.role }, options: ["Mosaico con fotos grandes"] },
        { who: { name: CARLOS.name, role: CARLOS.role }, options: ["Mosaico con fotos grandes"] },
        { who: { userId: ELAN }, options: ["Cuadrícula uniforme"] },
        { who: { userId: NATA }, options: ["Carrusel horizontal"] },
      ],
    },
  });
  await comment(task.id, { who: CARLOS, reviewCheckId: d3.id, body: "En mi celular el menú se corta en pantallas pequeñas. Les envío una captura.", images: [IMG.captura3] });
  await comment(task.id, { who: { userId: LINA, name: "Lina" }, reviewCheckId: d3.id, body: "Gracias, Carlos. Lo corregimos hoy mismo y le avisamos." });
  await comment(task.id, { who: MARIA, reviewCheckId: d1.id, body: "Ya se ve mucho mejor el logo. Reviso el texto y califico." });

  // Hilo general de la tarea con una pregunta de selección múltiple
  const gen = await comment(task.id, { who: CARLOS, body: "¿Cuándo se podría publicar el sitio? Lo necesito para la reunión del viernes." });
  await comment(task.id, { who: { userId: ELAN, name: "Elan" }, parentId: gen.id, body: "Si se acepta esta ronda, se publica el jueves." });
  await comment(task.id, {
    who: { userId: ELAN, name: "Elan" },
    body: "¿En qué idiomas debe estar disponible el sitio?",
    poll: {
      multiple: true,
      options: ["Español", "Inglés", "Portugués"],
      votes: [
        { who: { name: MARIA.name, role: MARIA.role }, options: ["Español", "Inglés"] },
        { who: { name: CARLOS.name, role: CARLOS.role }, options: ["Español", "Inglés", "Portugués"] },
        { who: { userId: LINA }, options: ["Español", "Inglés"] },
      ],
    },
  });

  // Hilo interno de la ronda 2
  await roundMessage(r2.id, { userId: LINA, body: "Ronda 2 enviada. La galería quedó con 12 fotos de ejemplo.", images: [IMG.render] });
  await roundMessage(r2.id, { userId: ELAN, body: "Perfecto. Estoy pendiente de la respuesta del cliente sobre la versión móvil." });

  return { task, token };
}

async function seedQa() {
  const { task, token } = await newTask(
    "[Ejemplo] Pruebas — Formulario de contacto",
    "QA",
    "<p>Pruebas funcionales del formulario de contacto del sitio: validaciones, mensajes y envío.</p>",
    [LINA],
    [ALEJANDRO, NATA]
  );

  // ── Ronda 1 (cerrada, devuelta) ──
  const r1 = await prisma.reviewRound.create({
    data: { taskId: task.id, roundNumber: 1, submittedById: LINA, submittedAt: tick(), outcome: "RETURNED", closedAt: tick(150) },
  });
  await prisma.reviewCheck.create({ data: { reviewRoundId: r1.id, order: 0, title: "Envía el formulario con datos válidos", result: "APPROVED", reviewedById: ALEJANDRO } });
  const q2 = await prisma.reviewCheck.create({
    data: { reviewRoundId: r1.id, order: 1, title: "Rechaza un correo inválido", criteria: "a@b\nsin arroba\nespacios", result: "FAILED", reviewedById: ALEJANDRO, note: "Acepta «a@b» sin dominio." },
  });
  await prisma.reviewCheck.create({ data: { reviewRoundId: r1.id, order: 2, title: "Muestra mensaje de éxito", result: "APPROVED", reviewedById: NATA } });
  const q4 = await prisma.reviewCheck.create({
    data: { reviewRoundId: r1.id, order: 3, title: "El campo teléfono solo acepta números", result: "FAILED", reviewedById: NATA, note: "Permite escribir letras." },
  });
  await prisma.reviewCheckEvidence.create({ data: { reviewCheckId: q2.id, fileUrl: IMG.captura1.url, fileName: IMG.captura1.name, mimeType: IMG.captura1.mimeType } });
  await prisma.reviewCheckEvidence.create({ data: { reviewCheckId: q4.id, fileUrl: IMG.captura2.url, fileName: IMG.captura2.name, mimeType: IMG.captura2.mimeType } });

  await roundMessage(r1.id, { userId: ALEJANDRO, body: "Dos pruebas fallaron: correo y teléfono. Dejo las capturas en cada una.", images: [IMG.captura1, IMG.captura2] });
  await roundMessage(r1.id, { userId: LINA, body: "Entendido. Las corrijo y reenvío. ¿Con qué navegadores probamos la ronda 2?", poll: {
    multiple: true,
    options: ["Chrome", "Firefox", "Safari", "Edge"],
    votes: [
      { who: { userId: ALEJANDRO }, options: ["Chrome", "Firefox", "Safari"] },
      { who: { userId: NATA }, options: ["Chrome", "Edge"] },
      { who: { userId: LINA }, options: ["Chrome", "Firefox"] },
      { who: { userId: ELAN }, options: ["Chrome", "Safari"] },
    ],
  } });
  await roundMessage(r1.id, { userId: ELAN, body: "¿Se bloquea la publicación hasta corregir estas dos pruebas?", poll: {
    multiple: false,
    closed: true,
    options: ["Sí, se bloquea", "No, se publica y se corrige después"],
    votes: [
      { who: { userId: ELAN }, options: ["Sí, se bloquea"] },
      { who: { userId: ALEJANDRO }, options: ["Sí, se bloquea"] },
      { who: { userId: NATA }, options: ["Sí, se bloquea"] },
      { who: { userId: DAVID }, options: ["No, se publica y se corrige después"] },
    ],
  } });
  await roundMessage(r1.id, { userId: ELAN, body: "Queda decidido: se bloquea. Cierro la pregunta." });

  // ── Ronda 2 (activa): pruebas pendientes ──
  const r2 = await prisma.reviewRound.create({ data: { taskId: task.id, roundNumber: 2, submittedById: LINA, submittedAt: tick(90) } });
  const p1 = await prisma.reviewCheck.create({ data: { reviewRoundId: r2.id, order: 0, title: "Rechaza un correo inválido (corregido)", criteria: "a@b\nsin arroba\nespacios" } });
  const p2 = await prisma.reviewCheck.create({ data: { reviewRoundId: r2.id, order: 1, title: "El campo teléfono solo acepta números (corregido)" } });
  const p3 = await prisma.reviewCheck.create({ data: { reviewRoundId: r2.id, order: 2, title: "El formulario funciona en pantallas de celular" } });

  // Hilos internos por prueba (comentarios, menciones, imágenes y preguntas)
  await checkMessage(task.id, q2.id, { userId: ALEJANDRO, body: `${at(LINA)} el correo «a@b» pasa la validación. Lo dejo en la captura: ${imageMarker(IMG.captura1.url)}`, mentions: [LINA] });
  await checkMessage(task.id, q2.id, { userId: LINA, body: `Gracias ${at(ALEJANDRO)}. Ya agregué la validación de dominio; la subo en la ronda 2.`, mentions: [ALEJANDRO] });
  await checkMessage(task.id, q4.id, { userId: NATA, body: `El teléfono acepta letras y símbolos. ${at(LINA)} ¿lo limitamos a números y +?`, mentions: [LINA] });
  await checkMessage(task.id, q4.id, {
    userId: LINA,
    body: "¿Cómo validamos el teléfono?",
    poll: {
      multiple: false,
      options: ["Solo números", "Números y el signo +", "Cualquier formato, se limpia al guardar"],
      votes: [
        { who: { userId: LINA }, options: ["Números y el signo +"] },
        { who: { userId: NATA }, options: ["Números y el signo +"] },
        { who: { userId: ALEJANDRO }, options: ["Solo números"] },
      ],
    },
  });
  await checkMessage(task.id, p1.id, { userId: LINA, body: `${at(ALEJANDRO)} ya corregí el correo. ¿Puedes probar con «a@b», «sin arroba» y uno con espacios?`, mentions: [ALEJANDRO] });
  await checkMessage(task.id, p1.id, {
    userId: ALEJANDRO,
    body: "¿Qué casos de correo probamos además de los listados?",
    poll: {
      multiple: true,
      options: ["Con tilde o ñ", "Con mayúsculas", "Con más de 60 caracteres", "Con un punto al final"],
      votes: [
        { who: { userId: ALEJANDRO }, options: ["Con tilde o ñ", "Con un punto al final"] },
        { who: { userId: NATA }, options: ["Con mayúsculas", "Con tilde o ñ"] },
        { who: { userId: LINA }, options: ["Con tilde o ñ", "Con mayúsculas", "Con un punto al final"] },
      ],
    },
  });
  await checkMessage(task.id, p3.id, { userId: NATA, body: `Empiezo esta prueba hoy. ${at(ELAN)} ¿me confirmas los modelos de celular disponibles?`, mentions: [ELAN] });
  await checkMessage(task.id, p3.id, { userId: ELAN, body: `Hay un Android y un iPhone en la oficina. Aquí una referencia del tamaño de pantalla: ${imageMarker(IMG.captura3.url)}` });
  await roundMessage(r2.id, { userId: LINA, body: "Ronda 2 enviada con ambas correcciones. Falta la prueba en celular.", images: [IMG.captura3] });
  await roundMessage(r2.id, { userId: NATA, body: "Tomo las pruebas en celular esta tarde." });

  // Hilo compartido general de la tarea (el link de una prueba solo muestra descripción y comentarios)
  const g = await comment(task.id, { who: CARLOS, body: "¿Ya se puede probar el formulario desde el sitio publicado?" });
  await comment(task.id, { who: { userId: LINA, name: "Lina" }, parentId: g.id, body: "Todavía está en pruebas internas. Le avisamos cuando esté listo." });

  return { task, token };
}


// Mensaje de una conversación interna (del proyecto o de una tarea) con @menciones y/o pregunta.
// Directo a la base: no dispara WhatsApp ni notificaciones.
async function conversationMessage(
  taskId: string | null,
  a: { userId: string; body: string; mentions?: string[]; poll?: { multiple: boolean; closed?: boolean; options: string[]; votes: { who: Voter; options: string[] }[] } }
) {
  const m = await prisma.internalMessage.create({
    data: {
      projectId: PROJECT_ID,
      taskId,
      authorId: a.userId,
      body: a.body,
      createdAt: tick(),
      reads: { create: { userId: a.userId } },
      mentions: { create: (a.mentions ?? []).map((userId) => ({ userId })) },
      ...(a.poll
        ? { poll: { create: { multiple: a.poll.multiple, closed: a.poll.closed ?? false, options: { create: a.poll.options.map((label, order) => ({ label, order })) } } } }
        : {}),
    },
    include: { poll: { include: { options: true } } },
  });
  if (a.poll && m.poll) await addVotes(m.poll.id, m.poll.options, a.poll.votes);
}

// Comentario del link compartido del PROYECTO (pestaña Definición), del cliente o del equipo.
async function projectShareComment(a: {
  who: { userId: string; name: string } | { name: string; role: string };
  body: string;
  parentId?: string;
  poll?: { multiple: boolean; options: string[]; votes: { who: Voter; options: string[] }[] };
}) {
  const team = "userId" in a.who;
  const c = await prisma.shareComment.create({
    data: {
      projectId: PROJECT_ID,
      parentId: a.parentId ?? null,
      authorName: a.who.name,
      authorRole: team ? "Equipo" : (a.who as { role: string }).role,
      authorUserId: team ? (a.who as { userId: string }).userId : null,
      body: a.body,
      createdAt: tick(),
      ...(a.poll ? { poll: { create: { multiple: a.poll.multiple, options: { create: a.poll.options.map((label, order) => ({ label, order })) } } } } : {}),
    },
    include: { poll: { include: { options: true } } },
  });
  if (a.poll && c.poll) await addVotes(c.poll.id, c.poll.options, a.poll.votes);
  return c;
}

async function seedProjectLevel(acceptanceTaskId: string) {
  // Conversación interna del PROYECTO
  await conversationMessage(null, { userId: ELAN, body: `[Ejemplo] ${at(LINA)} ${at(NATA)} esta semana cerramos las pruebas del formulario y la aceptación del sitio.`, mentions: [LINA, NATA] });
  await conversationMessage(null, {
    userId: LINA,
    body: "[Ejemplo] ¿Qué día hacemos la revisión general del proyecto?",
    poll: {
      multiple: true,
      options: ["Lunes", "Miércoles", "Viernes"],
      votes: [
        { who: { userId: LINA }, options: ["Miércoles", "Viernes"] },
        { who: { userId: ELAN }, options: ["Miércoles"] },
        { who: { userId: NATA }, options: ["Lunes", "Miércoles"] },
        { who: { userId: ALEJANDRO }, options: ["Viernes"] },
      ],
    },
  });
  // Conversación interna de la TAREA de aceptación
  await conversationMessage(acceptanceTaskId, { userId: ELAN, body: `[Ejemplo] ${at(LINA)} recuerda subir la evidencia de la galería antes de la ronda 3.`, mentions: [LINA] });
  await conversationMessage(acceptanceTaskId, {
    userId: LINA,
    body: "[Ejemplo] ¿Cómo enviamos la evidencia de la versión móvil?",
    poll: {
      multiple: false,
      options: ["Capturas de pantalla", "Video corto", "Enlace a la página de pruebas"],
      votes: [
        { who: { userId: LINA }, options: ["Video corto"] },
        { who: { userId: ELAN }, options: ["Capturas de pantalla"] },
        { who: { userId: NATA }, options: ["Video corto"] },
      ],
    },
  });
  // Link compartido del proyecto (pestaña Definición): comentarios del cliente y del equipo, con pregunta
  let link = await prisma.shareLink.findFirst({ where: { projectId: PROJECT_ID, targetType: "PROJECT", revokedAt: null } });
  if (!link) link = await prisma.shareLink.create({ data: { token: generateShareToken(), targetType: "PROJECT", projectId: PROJECT_ID, createdById: ELAN } });
  const c1 = await projectShareComment({ who: MARIA, body: "[Ejemplo] Los objetivos se ven bien. ¿Podemos sumar uno sobre el posicionamiento en buscadores?" });
  await projectShareComment({ who: { userId: ELAN, name: "Elan" }, parentId: c1.id, body: "[Ejemplo] Sí, lo agregamos. Antes queremos confirmar la prioridad con ustedes." });
  await projectShareComment({
    who: { userId: ELAN, name: "Elan" },
    body: "[Ejemplo] ¿Qué objetivo debe tener la prioridad más alta?",
    poll: {
      multiple: false,
      options: ["Aumentar las ventas en línea", "Mejorar el posicionamiento", "Reducir el tiempo de respuesta"],
      votes: [
        { who: { name: MARIA.name, role: MARIA.role }, options: ["Mejorar el posicionamiento"] },
        { who: { name: CARLOS.name, role: CARLOS.role }, options: ["Aumentar las ventas en línea"] },
        { who: { userId: ELAN }, options: ["Aumentar las ventas en línea"] },
        { who: { userId: LINA }, options: ["Mejorar el posicionamiento"] },
      ],
    },
  });
  return link.token;
}

async function main() {
  const removed = await cleanPrevious();
  const acc = await seedAcceptance();
  const qa = await seedQa();
  const projectToken = await seedProjectLevel(acc.task.id);
  const base = "http://localhost:3000";
  console.log(removed ? `(se reemplazaron ${removed} tareas de ejemplo anteriores)` : "");
  console.log("ACEPTACION app:", `${base}/projects/${PROJECT_ID}/tasks/${acc.task.id}`);
  console.log("ACEPTACION link:", `${base}/share/${acc.token}`);
  console.log("PRUEBAS app:", `${base}/projects/${PROJECT_ID}/tasks/${qa.task.id}`);
  console.log("PROYECTO (Definición) app:", `${base}/projects/${PROJECT_ID}?view=definition`);
  console.log("PROYECTO (Definición) link:", `${base}/share/${projectToken}?view=definition`);
  console.log("PROYECTO (Comentarios) app:", `${base}/projects/${PROJECT_ID}?view=conversation`);
  console.log("PRUEBAS link:", `${base}/share/${qa.token}`);
  process.exit(0);
}
main().catch((e) => {
  console.error(String(e.message ?? e).slice(-1200));
  process.exit(1);
});
