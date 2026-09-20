"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveShareToken } from "@/lib/shareLinks";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { fetchPageTitle } from "@/lib/pageTitle";
import { notify, notifyShareActivity, notifyReturned } from "@/lib/notifications";

// Todas estas acciones son públicas a propósito (punto 15/16 confirmado con
// el usuario): las llama /share/[token] sin sesión — el token del link ES la
// autorización. Nunca hay una acción de eliminar acá: un visitante externo
// solo puede sumar, jamás borrar.

async function requireProjectLink(token: string) {
  const link = await resolveShareToken(token);
  if (!link || link.targetType !== "PROJECT" || !link.projectId) throw new Error("Link inválido o vencido.");
  return link.projectId;
}

async function requireTaskLink(token: string) {
  const link = await resolveShareToken(token);
  if (!link || link.targetType !== "TASK" || !link.taskId) throw new Error("Link inválido o vencido.");
  return link.taskId;
}

const urlSchema = z.string().trim().url();
const nameSchema = z.string().trim().min(1);

export async function addPublicProjectAttachment(token: string, file: { url: string; name: string; mimeType: string }) {
  const projectId = await requireProjectLink(token);
  await prisma.projectAttachment.create({
    data: { projectId, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType },
  });
  revalidatePath(`/share/${token}`);
  return { ok: true as const };
}

export async function addPublicProjectLink(token: string, url: string, name: string) {
  const projectId = await requireProjectLink(token);
  const parsedUrl = urlSchema.safeParse(url);
  if (!parsedUrl.success) return { ok: false as const, error: "Ese link no parece válido — revisá que sea una dirección web completa (con https://)." };
  // Sin nombre se usa el título de la página; si no se logra obtener, se pide el nombre.
  const title = name.trim() || (await fetchPageTitle(parsedUrl.data));
  if (!title) return { ok: false as const, error: "No se pudo obtener el nombre de ese link. Escribí uno." };

  await prisma.projectLink.create({ data: { projectId, title, url: parsedUrl.data } });
  revalidatePath(`/share/${token}`);
  return { ok: true as const };
}

// Solo INSUMO (punto 16 confirmado: la evidencia la sube nada más el
// asignado, adentro de la app) y solo mientras la tarea no esté completada
// — misma regla que ya rige puertas adentro.
async function assertCanUploadPublicInsumo(taskId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { status: true, title: true } });
  if (task.status === "COMPLETED") throw new Error("La tarea ya está completada — no se pueden subir más insumos.");
  return task.title;
}

export async function addPublicTaskInsumo(token: string, file: { url: string; name: string; mimeType: string }) {
  const taskId = await requireTaskLink(token);
  const taskTitle = await assertCanUploadPublicInsumo(taskId);
  await prisma.attachment.create({
    data: { taskId, kind: "INSUMO", fileUrl: file.url, fileName: file.name, mimeType: file.mimeType },
  });
  await notifyShareActivity(taskId, `Se subió un insumo desde el link compartido de "${taskTitle}"`);
  revalidatePath(`/share/${token}`);
  return { ok: true as const };
}

export async function addPublicTaskInsumoLink(token: string, url: string, name: string) {
  const taskId = await requireTaskLink(token);
  const taskTitle = await assertCanUploadPublicInsumo(taskId);
  const parsedUrl = urlSchema.safeParse(url);
  if (!parsedUrl.success) return { ok: false as const, error: "Ese link no parece válido — revisá que sea una dirección web completa (con https://)." };
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) return { ok: false as const, error: "Ponele un nombre al link." };

  await prisma.attachment.create({
    data: { taskId, kind: "INSUMO", fileUrl: parsedUrl.data, fileName: parsedName.data, mimeType: LINK_MIME_TYPE },
  });
  await notifyShareActivity(taskId, `Se agregó un link de insumo desde el link compartido de "${taskTitle}"`);
  revalidatePath(`/share/${token}`);
  return { ok: true as const };
}

// Tarea tipo ACCEPTANCE (Aceptación): el cliente, sin cuenta, acepta o
// devuelve cada característica de la ronda activa — mismo mecanismo de
// identificación que ShareComment (nombre obligatorio, rol opcional). Al
// devolver, la nota es obligatoria (el equipo necesita saber qué corregir).
// Cuando el cliente califica la última característica pendiente, la ronda se
// cierra sola (mismo criterio que closeReviewRound puertas adentro): si
// quedó alguna devuelta -> Task.status=RETURNED + notifyReturned; si no ->
// queda Aceptada, y el equipo completa la tarea a mano desde AcceptancePanel.
const acceptanceDecisionSchema = z.object({
  decision: z.enum(["ACCEPTED", "RETURNED"]),
  name: z.string().trim().min(1),
  role: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

export async function setPublicAcceptanceDecision(
  token: string,
  checkId: string,
  data: { decision: "ACCEPTED" | "RETURNED"; name: string; role?: string; note?: string }
) {
  const taskId = await requireTaskLink(token);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { type: true, title: true, projectId: true } });
  if (task.type !== "ACCEPTANCE") return { ok: false as const, error: "Esta tarea no admite decisiones de aceptación." };

  const parsed = acceptanceDecisionSchema.safeParse(data);
  if (!parsed.success) return { ok: false as const, error: "Completá tu nombre." };
  if (parsed.data.decision === "RETURNED" && !parsed.data.note) {
    return { ok: false as const, error: "Contanos por qué la devolvés." };
  }

  const check = await prisma.reviewCheck.findUniqueOrThrow({
    where: { id: checkId },
    include: { reviewRound: true },
  });
  if (check.reviewRound.taskId !== taskId) return { ok: false as const, error: "Esa característica no pertenece a esta tarea." };
  if (check.reviewRound.outcome !== null) return { ok: false as const, error: "Esta ronda ya quedó cerrada." };
  if (check.result !== null) return { ok: false as const, error: "Esa característica ya fue calificada." };

  const result = parsed.data.decision === "ACCEPTED" ? "APPROVED" : "FAILED";
  await prisma.reviewCheck.update({
    where: { id: checkId },
    data: {
      result,
      note: parsed.data.note || null,
      externalReviewerName: parsed.data.name,
      externalReviewerRole: parsed.data.role || null,
    },
  });

  // Si con esta decisión ya quedaron todas las características de la ronda
  // calificadas, se cierra sola — el cliente no tiene (ni debería tener) un
  // botón de "cerrar ronda" aparte.
  const siblings = await prisma.reviewCheck.findMany({
    where: { reviewRoundId: check.reviewRound.id },
    select: { result: true },
  });
  const allResolved = siblings.every((c) => c.result !== null);
  if (allResolved) {
    const hasReturned = siblings.some((c) => c.result === "FAILED");
    const outcome = hasReturned ? "RETURNED" : "APPROVED";
    await prisma.$transaction(async (tx) => {
      await tx.reviewRound.update({ where: { id: check.reviewRound.id }, data: { outcome, closedAt: new Date() } });
      if (hasReturned) {
        await tx.task.update({ where: { id: taskId }, data: { status: "RETURNED" } });
      }
    });
    if (hasReturned) await notifyReturned(taskId);
    else await notifyShareActivity(taskId, `El cliente aceptó toda la entrega de "${task.title}" ✅`);
  }

  revalidatePath(`/share/${token}`);
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  return { ok: true as const };
}

const commentSchema = z.object({
  authorName: z.string().trim().min(1),
  authorRole: z.string().trim().optional(),
  body: z.string().trim(),
});

const commentFileSchema = z.object({ url: z.string().min(1), name: z.string().min(1), mimeType: z.string().min(1) });

// Punto 4: el mismo comentario ahora cuelga de una TAREA (general, o puntual
// a un cambio de Ajuste vía adjustmentItemId) o de un PROYECTO (pestaña
// Definición) — lo decide el propio tipo de link, resuelto una sola vez acá.
// parentId es opcional: si viene, es una respuesta a ese comentario (un solo
// nivel de anidamiento, no hilos recursivos).
export async function addShareComment(
  token: string,
  data: { authorName: string; authorRole?: string; body: string; adjustmentItemId?: string; reviewCheckId?: string; parentId?: string; attachments?: { url: string; name: string; mimeType: string }[] }
) {
  const link = await resolveShareToken(token);
  if (!link) return { ok: false as const, error: "Link inválido o vencido." };
  const parsed = commentSchema.safeParse(data);
  const files = z.array(commentFileSchema).max(10).safeParse(data.attachments ?? []);
  if (!parsed.success || !files.success || (!parsed.data.body && files.data.length === 0)) {
    return { ok: false as const, error: "Completá tu nombre y el comentario." };
  }

  let taskId: string | null = null;
  let projectId: string | null = null;

  if (link.targetType === "TASK") {
    taskId = link.taskId!;
    if (data.adjustmentItemId) {
      const item = await prisma.adjustmentItem.findUnique({ where: { id: data.adjustmentItemId }, select: { taskId: true, clientReviewOpen: true } });
      if (!item || item.taskId !== taskId) return { ok: false as const, error: "Ese cambio no pertenece a esta tarea." };
      // Con la revisión cerrada el cliente ya no comenta ni responde en ese cambio.
      if (!item.clientReviewOpen) return { ok: false as const, error: "La revisión de este cambio está cerrada. Solo el equipo puede habilitar una nueva." };
    }
    // Tarea de Aceptación: comentario sobre una característica de la ronda. Se
    // cierra cuando el cliente la califica o la ronda termina.
    if (data.reviewCheckId) {
      const check = await prisma.reviewCheck.findUnique({
        where: { id: data.reviewCheckId },
        select: { result: true, reviewRound: { select: { taskId: true, outcome: true } } },
      });
      if (!check || check.reviewRound.taskId !== taskId) return { ok: false as const, error: "Esa característica no pertenece a esta tarea." };
      if (check.result !== null || check.reviewRound.outcome !== null) {
        return { ok: false as const, error: "Esta característica ya fue calificada, por lo que su hilo quedó cerrado." };
      }
    }
  } else if (link.targetType === "PROJECT") {
    projectId = link.projectId!;
  } else {
    return { ok: false as const, error: "Link inválido." };
  }

  if (data.parentId) {
    const parent = await prisma.shareComment.findUnique({
      where: { id: data.parentId },
      select: { taskId: true, projectId: true },
    });
    if (!parent || parent.taskId !== taskId || parent.projectId !== projectId) {
      return { ok: false as const, error: "Ese comentario ya no existe." };
    }
  }

  // Las imágenes/archivos adjuntos quedan como INSUMO de la tarea (mismo
  // criterio y misma regla de tarea completada que addPublicTaskInsumo).
  if (files.data.length > 0) {
    if (!taskId) return { ok: false as const, error: "Acá no se pueden adjuntar archivos." };
    const status = (await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { status: true } })).status;
    if (status === "COMPLETED") return { ok: false as const, error: "La tarea ya está completada — no se pueden subir más archivos." };
  }

  await prisma.$transaction(async (tx) => {
    const comment = await tx.shareComment.create({
      data: {
        taskId,
        projectId,
        adjustmentItemId: data.adjustmentItemId ?? null,
        reviewCheckId: data.reviewCheckId ?? null,
        parentId: data.parentId ?? null,
        authorName: parsed.data.authorName,
        authorRole: parsed.data.authorRole || null,
        body: parsed.data.body,
      },
    });
    if (files.data.length > 0 && taskId) {
      await tx.attachment.createMany({
        data: files.data.map((f) => ({
          taskId,
          kind: "INSUMO" as const,
          fileUrl: f.url,
          fileName: f.name,
          mimeType: f.mimeType,
          externalUploaderName: parsed.data.authorName,
          externalUploaderRole: parsed.data.authorRole || null,
          shareCommentId: comment.id,
        })),
      });
    }
  });

  // Notifica por WA + app (punto 4): al PM y, si es un comentario de tarea,
  // también a asignados y revisores (ya cubierto por notifyShareActivity) —
  // un comentario del link no tiene cuenta a la que avisarle de vuelta.
  if (taskId) {
    const taskTitle = (await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { title: true } })).title;
    const verb = data.parentId ? "respondió en" : "comentó en";
    await notifyShareActivity(taskId, `${parsed.data.authorName} ${verb} "${taskTitle}" (link compartido)`);
  } else if (projectId) {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true, pmId: true } });
    const verb = data.parentId ? "respondió en la Definición de" : "comentó en la Definición de";
    await notify(
      [project.pmId],
      "SHARE_ACTIVITY",
      `${parsed.data.authorName} ${verb} "${project.name}" (link compartido)`,
      undefined,
      `/projects/${projectId}?view=definition`,
      { projectId }
    );
  }

  revalidatePath(`/share/${token}`);
  return { ok: true as const };
}

// Revisión de los cambios solicitados de una tarea tipo Ajuste: el cliente
// califica cada cambio abierto (Apruebo / Necesita cambios) y la envía UNA sola
// vez. Al enviarla, esos cambios quedan cerrados: el cliente no puede cambiar
// su calificación ni comentando; solo el equipo los vuelve a abrir
// (reopenAdjustmentReview, adentro de la app). Es todo o nada: hay que calificar
// todos los cambios abiertos.
export async function submitPublicAdjustmentReview(
  token: string,
  data: { name: string; role?: string; decisions: Record<string, boolean> }
) {
  const taskId = await requireTaskLink(token);
  const name = data.name.trim();
  if (!name) return { ok: false as const, error: "Falta indicar el nombre antes de enviar." };

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { type: true, title: true, status: true, adjustmentItems: { where: { clientReviewOpen: true }, select: { id: true } } },
  });
  if (task.type !== "ADJUSTMENT") return { ok: false as const, error: "Esta tarea no admite esta revisión." };
  if (task.status === "COMPLETED") return { ok: false as const, error: "La tarea ya está completada." };

  const open = task.adjustmentItems;
  if (open.length === 0) return { ok: false as const, error: "No hay cambios abiertos para revisar." };
  if (open.some((i) => typeof data.decisions[i.id] !== "boolean")) {
    return { ok: false as const, error: "Falta calificar algún cambio: en todos debe indicarse Apruebo o Necesita cambios." };
  }

  const now = new Date();
  await prisma.$transaction(
    open.map((i) =>
      prisma.adjustmentItem.updateMany({
        // clientReviewOpen en el where: si otra pestaña ya la envió, no la pisa.
        where: { id: i.id, clientReviewOpen: true },
        data: {
          clientApproval: data.decisions[i.id],
          clientApprovalAt: now,
          clientApprovalBy: name,
          clientReviewOpen: false,
        },
      })
    )
  );

  const approved = open.filter((i) => data.decisions[i.id]).length;
  const changes = open.length - approved;
  await notifyShareActivity(
    taskId,
    `${name} envió su revisión de "${task.title}": ${approved} aprobado(s)${changes > 0 ? `, ${changes} con cambios solicitados` : ""}`
  );
  revalidatePath(`/share/${token}`);
  return { ok: true as const };
}

// Respuesta de un externo (con el link) a una pregunta del equipo. Una sola
// respuesta por persona (se identifica por nombre) que puede cambiar hasta que
// el equipo cierre la pregunta. Nunca se devuelven resultados al externo.
export async function submitPublicPollVote(
  token: string,
  pollId: string,
  data: { name: string; role?: string; optionIds: string[] }
) {
  // El link puede ser de una tarea o del proyecto (Definición): la pregunta debe colgar de lo que el link comparte.
  const link = await resolveShareToken(token);
  if (!link) return { ok: false as const, error: "Link inválido o vencido." };
  const name = data.name.trim();
  if (!name) return { ok: false as const, error: "Falta indicar el nombre antes de responder." };

  const poll = await prisma.sharePoll.findUnique({
    where: { id: pollId },
    select: {
      multiple: true,
      closed: true,
      options: { select: { id: true } },
      comment: { select: { taskId: true, projectId: true, task: { select: { title: true } }, project: { select: { name: true, pmId: true } } } },
    },
  });
  const c = poll?.comment;
  const belongs = link.targetType === "TASK" ? c?.taskId === link.taskId : c?.projectId === link.projectId;
  if (!poll || !c || !belongs) return { ok: false as const, error: "Esa pregunta ya no existe." };
  if (poll.closed) return { ok: false as const, error: "La pregunta ya está cerrada." };

  const valid = new Set(poll.options.map((o) => o.id));
  const chosen = [...new Set(data.optionIds)].filter((id) => valid.has(id));
  if (chosen.length === 0) return { ok: false as const, error: "Falta elegir una opción." };
  if (!poll.multiple && chosen.length > 1) return { ok: false as const, error: "Esta pregunta admite una sola opción." };

  const voterKey = `e:${name.toLowerCase()}`;
  await prisma.$transaction([
    prisma.sharePollVote.deleteMany({ where: { pollId, voterKey } }),
    prisma.sharePollVote.createMany({
      data: chosen.map((optionId) => ({ pollId, optionId, voterKey, externalName: name, externalRole: data.role?.trim() || null })),
    }),
  ]);
  if (c.taskId) {
    await notifyShareActivity(c.taskId, `${name} respondió una pregunta en "${c.task?.title}" (link compartido)`);
  } else if (c.projectId && c.project) {
    await notify(
      [c.project.pmId],
      "SHARE_ACTIVITY",
      `${name} respondió una pregunta en la Definición de "${c.project.name}" (link compartido)`,
      undefined,
      `/projects/${c.projectId}?view=definition`,
      { projectId: c.projectId }
    );
  }
  revalidatePath(`/share/${token}`);
  return { ok: true as const };
}
