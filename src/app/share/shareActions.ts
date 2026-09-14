"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveShareToken } from "@/lib/shareLinks";
import { LINK_MIME_TYPE } from "@/lib/attachments";
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
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) return { ok: false as const, error: "Ponele un nombre al link." };

  await prisma.projectLink.create({ data: { projectId, title: parsedName.data, url: parsedUrl.data } });
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
  body: z.string().trim().min(1),
});

// Punto 4: el mismo comentario ahora cuelga de una TAREA (general, o puntual
// a un cambio de Ajuste vía adjustmentItemId) o de un PROYECTO (pestaña
// Definición) — lo decide el propio tipo de link, resuelto una sola vez acá.
// parentId es opcional: si viene, es una respuesta a ese comentario (un solo
// nivel de anidamiento, no hilos recursivos).
export async function addShareComment(
  token: string,
  data: { authorName: string; authorRole?: string; body: string; adjustmentItemId?: string; parentId?: string; adjustmentApproval?: boolean }
) {
  const link = await resolveShareToken(token);
  if (!link) return { ok: false as const, error: "Link inválido o vencido." };
  const parsed = commentSchema.safeParse(data);
  if (!parsed.success) return { ok: false as const, error: "Completá tu nombre y el comentario." };

  let taskId: string | null = null;
  let projectId: string | null = null;

  if (link.targetType === "TASK") {
    taskId = link.taskId!;
    if (data.adjustmentItemId) {
      const item = await prisma.adjustmentItem.findUnique({ where: { id: data.adjustmentItemId }, select: { taskId: true } });
      if (!item || item.taskId !== taskId) return { ok: false as const, error: "Ese cambio no pertenece a esta tarea." };
      // La aprobación obligatoria acompaña el comentario principal del
      // cliente; las respuestas solo continúan ese hilo ya identificado.
      if (!data.parentId && typeof data.adjustmentApproval !== "boolean") {
        return { ok: false as const, error: "Indicá si aprobás el ajuste o necesitás cambios antes de comentar." };
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

  await prisma.$transaction(async (tx) => {
    await tx.shareComment.create({
      data: {
        taskId,
        projectId,
        adjustmentItemId: data.adjustmentItemId ?? null,
        parentId: data.parentId ?? null,
        authorName: parsed.data.authorName,
        authorRole: parsed.data.authorRole || null,
        body: parsed.data.body,
      },
    });
    if (data.adjustmentItemId && !data.parentId && typeof data.adjustmentApproval === "boolean") {
      await tx.adjustmentItem.update({
        where: { id: data.adjustmentItemId },
        data: { clientApproval: data.adjustmentApproval, clientApprovalAt: new Date(), clientApprovalBy: parsed.data.authorName },
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
