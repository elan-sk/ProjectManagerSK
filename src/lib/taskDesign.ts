import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canEditTask, canReviewTask, canSeeProject, getProjectAdmin, type Actor } from "@/lib/permissions";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { mimeFromFileName } from "@/lib/uploadFile";
import { createShareLink, getActiveShareLink, revokeShareLink } from "@/lib/shareLinks";
import { submitReviewRound } from "@/app/(app)/projects/[id]/tasks/[taskId]/reviewActions";
import { submitAcceptanceRound } from "@/app/(app)/projects/[id]/tasks/[taskId]/acceptanceActions";

// Diseño de Ajustes, Pruebas (QA) y Aceptaciones por API — y el mismo motor que
// usa el chat. Cada función recibe al usuario que actúa (Actor: su id y rol reales)
// y aplica exactamente el permiso que exige la app web para esa acción: nada acá
// es un permiso especial ni una clave maestra. Devuelve { ok, ...datos } o
// { ok: false, status, error } para que la ruta lo traduzca a HTTP.

export type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

// ---------- Archivos ----------

// Un archivo es lo que devolvió POST /api/upload ({ url: "/uploads/…", name, mimeType })
// o un link http(s). Nunca una ruta cualquiera del servidor.
export const fileRefSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .refine((u) => /^https?:\/\/\S+$/i.test(u) || /^\/uploads\/[A-Za-z0-9._-]+$/.test(u), "La url debe ser un link https:// o la que devolvió /api/upload."),
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).optional(),
});
export type FileRef = z.infer<typeof fileRefSchema>;

function toFile(f: FileRef) {
  const isLink = /^https?:\/\//i.test(f.url);
  return { url: f.url, name: f.name, mimeType: f.mimeType ?? (isLink ? LINK_MIME_TYPE : mimeFromFileName(f.name || f.url)) };
}

const fileList = z.array(fileRefSchema).max(20);

// ---------- Helpers ----------

async function loadTask(taskId: string) {
  return prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true, type: true, status: true, project: { select: { hidden: true, pmId: true } } } });
}
const touch = (task: { projectId: string; id: string }) => revalidatePath(`/projects/${task.projectId}/tasks/${task.id}`);
const NO_EDIT = "No se cuenta con permiso para editar esta tarea (se necesita ser asignado, PM del proyecto o administrador).";
const NO_REVIEW = "No se cuenta con permiso para revisar esta tarea (se necesita ser revisor, PM del proyecto o administrador).";

// ---------- Lectura: estructura completa de una tarea ----------

const fileOut = (a: { id: string; fileUrl: string; fileName: string; mimeType: string }) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType });

export async function getTaskDesign(taskId: string, actor: Actor) {
  const task = await loadTask(taskId);
  if (!task || !canSeeProject(task.project, actor)) return fail(404, "La tarea no existe.");

  if (task.type === "ADJUSTMENT") {
    const items = await prisma.adjustmentItem.findMany({
      where: { taskId },
      orderBy: { order: "asc" },
      include: { attachments: true, _count: { select: { shareComments: true } } },
    });
    return {
      ok: true as const,
      taskId,
      type: task.type,
      items: items.map((i) => ({
        id: i.id,
        order: i.order,
        description: i.description,
        note: i.note,
        before: i.attachments.filter((a) => a.kind === "BEFORE").map(fileOut),
        after: i.attachments.filter((a) => a.kind === "AFTER").map(fileOut),
        // Calificación del cliente desde el link: solo se lee, nunca la cambia la API.
        client: { approval: i.clientApproval, by: i.clientApprovalBy, at: i.clientApprovalAt?.toISOString() ?? null, reviewOpen: i.clientReviewOpen },
        commentsCount: i._count.shareComments,
      })),
    };
  }

  if (task.type === "QA" || task.type === "ACCEPTANCE") {
    const rounds = await prisma.reviewRound.findMany({
      where: { taskId },
      orderBy: { roundNumber: "asc" },
      include: {
        deliverables: true,
        checks: {
          orderBy: { order: "asc" },
          include: { evidence: true, reviewedBy: { select: { name: true } }, _count: { select: { shareComments: true, internalMessages: true } } },
        },
        _count: { select: { messages: true } },
      },
    });
    return {
      ok: true as const,
      taskId,
      type: task.type,
      rounds: rounds.map((r) => ({
        id: r.id,
        roundNumber: r.roundNumber,
        outcome: r.outcome,
        submittedAt: r.submittedAt.toISOString(),
        closedAt: r.closedAt?.toISOString() ?? null,
        deliverables: r.deliverables.map(fileOut),
        roundMessagesCount: r._count.messages,
        checks: r.checks.map((c) => ({
          id: c.id,
          order: c.order,
          title: c.title,
          criteria: c.criteria,
          category: c.category,
          result: c.result,
          note: c.note,
          evidence: c.evidence.map(fileOut),
          reviewedBy: c.reviewedBy?.name ?? null,
          // Aceptación: quién calificó desde el link (cliente sin cuenta).
          externalReviewer: c.externalReviewerName ? { name: c.externalReviewerName, role: c.externalReviewerRole } : null,
          commentsCount: c._count.shareComments + c._count.internalMessages,
        })),
      })),
    };
  }
  return { ok: true as const, taskId, type: task.type };
}

// ---------- Ajustes ----------

export const adjustmentItemSchema = z.object({
  description: z.string().trim().min(1, "Falta describir el cambio solicitado.").max(1000),
  note: z.string().trim().max(2000).optional(),
  before: fileList.optional(),
  after: fileList.optional(),
});
export type AdjustmentItemInput = z.infer<typeof adjustmentItemSchema>;

export async function addAdjustmentItems(taskId: string, actor: Actor, items: AdjustmentItemInput[]) {
  const task = await loadTask(taskId);
  if (!task) return fail(404, "La tarea no existe.");
  if (task.type !== "ADJUSTMENT") return fail(409, "Esta tarea no es de tipo Ajuste.");
  if (!(await canEditTask(taskId, actor))) return fail(403, NO_EDIT);
  if (task.status === "COMPLETED") return fail(409, "La tarea ya está completada.");

  const start = await prisma.adjustmentItem.count({ where: { taskId } });
  const created: { id: string; description: string }[] = [];
  await prisma.$transaction(async (tx) => {
    for (const [i, item] of items.entries()) {
      const row = await tx.adjustmentItem.create({ data: { taskId, description: item.description, note: item.note || null, order: start + i } });
      const files = [
        ...(item.before ?? []).map((f) => ({ kind: "BEFORE" as const, f })),
        ...(item.after ?? []).map((f) => ({ kind: "AFTER" as const, f })),
      ];
      for (const { kind, f } of files) {
        const file = toFile(f);
        await tx.adjustmentAttachment.create({
          data: { adjustmentItemId: row.id, kind, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType, uploadedById: actor.id },
        });
      }
      created.push({ id: row.id, description: row.description });
    }
  });
  touch(task);
  return { ok: true as const, items: created };
}

export async function updateAdjustmentItem(itemId: string, actor: Actor, data: { description?: string; note?: string | null }) {
  const item = await prisma.adjustmentItem.findUnique({ where: { id: itemId }, select: { taskId: true, task: { select: { id: true, projectId: true } } } });
  if (!item) return fail(404, "Ese cambio no existe.");
  if (!(await canEditTask(item.taskId, actor))) return fail(403, NO_EDIT);
  await prisma.adjustmentItem.update({
    where: { id: itemId },
    data: {
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.note !== undefined ? { note: data.note?.trim() || null } : {}),
    },
  });
  touch(item.task);
  return { ok: true as const };
}

export async function deleteAdjustmentItem(itemId: string, actor: Actor) {
  const item = await prisma.adjustmentItem.findUnique({ where: { id: itemId }, select: { taskId: true, task: { select: { id: true, projectId: true } } } });
  if (!item) return fail(404, "Ese cambio no existe.");
  if (!(await canEditTask(item.taskId, actor))) return fail(403, NO_EDIT);
  await prisma.adjustmentItem.delete({ where: { id: itemId } });
  touch(item.task);
  return { ok: true as const };
}

export async function addAdjustmentAttachments(itemId: string, actor: Actor, kind: "BEFORE" | "AFTER", files: FileRef[]) {
  const item = await prisma.adjustmentItem.findUnique({ where: { id: itemId }, select: { taskId: true, task: { select: { id: true, projectId: true } } } });
  if (!item) return fail(404, "Ese cambio no existe.");
  if (!(await canEditTask(item.taskId, actor))) return fail(403, NO_EDIT);
  for (const f of files) {
    const file = toFile(f);
    await prisma.adjustmentAttachment.create({
      data: { adjustmentItemId: itemId, kind, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType, uploadedById: actor.id },
    });
  }
  touch(item.task);
  return { ok: true as const, added: files.length };
}

// Quitar un adjunto de un ajuste solo lo hace el PM/admin (igual que en la app).
export async function removeAdjustmentAttachment(attachmentId: string, actor: Actor) {
  const att = await prisma.adjustmentAttachment.findUnique({ where: { id: attachmentId }, select: { adjustmentItem: { select: { task: { select: { id: true, projectId: true } } } } } });
  if (!att) return fail(404, "Ese adjunto no existe.");
  if (!(await getProjectAdmin(att.adjustmentItem.task.projectId, actor))) return fail(403, "Solo el PM del proyecto o un administrador pueden quitar adjuntos.");
  await prisma.adjustmentAttachment.delete({ where: { id: attachmentId } });
  touch(att.adjustmentItem.task);
  return { ok: true as const };
}

// ---------- Pruebas (QA) y Aceptación: rondas y checks ----------

export const checkSchema = z.object({
  title: z.string().trim().min(1, "Falta el título de la prueba o característica.").max(500),
  criteria: z.string().trim().max(4000).optional(),
  category: z.string().trim().max(120).optional(),
  evidence: fileList.optional(),
});
export type CheckInput = z.infer<typeof checkSchema>;

// Pruebas: las agrega quien revisa. Aceptación: las arma el equipo (quien edita).
async function canDesignChecks(task: { id: string; type: string }, actor: Actor) {
  return task.type === "QA" ? canReviewTask(task.id, actor) : canEditTask(task.id, actor);
}

export async function addChecksToRound(roundId: string, actor: Actor, checks: CheckInput[]) {
  const round = await prisma.reviewRound.findUnique({ where: { id: roundId }, select: { id: true, roundNumber: true, outcome: true, taskId: true, task: { select: { id: true, projectId: true, type: true } } } });
  if (!round) return fail(404, "Esa ronda no existe.");
  if (round.task.type !== "QA" && round.task.type !== "ACCEPTANCE") return fail(409, "Esta tarea no es de tipo Prueba ni Aceptación.");
  if (!(await canDesignChecks(round.task, actor))) return fail(403, round.task.type === "QA" ? NO_REVIEW : NO_EDIT);
  // Mismo criterio que la app: la lista se arma en la primera ronda, mientras siga abierta.
  if (round.outcome !== null) return fail(409, "La ronda ya está cerrada.");
  if (round.roundNumber !== 1) return fail(409, "Solo se pueden agregar pruebas o características en la primera ronda.");

  const start = await prisma.reviewCheck.count({ where: { reviewRoundId: roundId } });
  const created: { id: string; title: string }[] = [];
  await prisma.$transaction(async (tx) => {
    for (const [i, c] of checks.entries()) {
      const row = await tx.reviewCheck.create({
        data: { reviewRoundId: roundId, title: c.title, criteria: c.criteria || null, category: c.category || null, order: start + i },
      });
      for (const f of c.evidence ?? []) {
        const file = toFile(f);
        await tx.reviewCheckEvidence.create({ data: { reviewCheckId: row.id, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType } });
      }
      created.push({ id: row.id, title: row.title });
    }
  });
  touch(round.task);
  return { ok: true as const, checks: created };
}

export async function removeCheck(checkId: string, actor: Actor) {
  const check = await prisma.reviewCheck.findUnique({ where: { id: checkId }, select: { result: true, reviewRound: { select: { outcome: true, task: { select: { id: true, projectId: true, type: true } } } } } });
  if (!check) return fail(404, "Esa prueba o característica no existe.");
  const task = check.reviewRound.task;
  if (!(await canDesignChecks(task, actor))) return fail(403, task.type === "QA" ? NO_REVIEW : NO_EDIT);
  if (check.reviewRound.outcome !== null || check.result !== null) return fail(409, "Ya tiene resultado o la ronda está cerrada; no se puede quitar.");
  await prisma.reviewCheck.delete({ where: { id: checkId } });
  touch(task);
  return { ok: true as const };
}

// Reescribe el texto de una prueba o característica sin perder sus capturas ni
// sus comentarios. Mismo criterio que removeCheck: sin resultado y ronda abierta.
export async function updateCheck(checkId: string, actor: Actor, data: { title?: string; criteria?: string | null; category?: string | null }) {
  const check = await prisma.reviewCheck.findUnique({ where: { id: checkId }, select: { result: true, reviewRound: { select: { outcome: true, task: { select: { id: true, projectId: true, type: true } } } } } });
  if (!check) return fail(404, "Esa prueba o característica no existe.");
  const task = check.reviewRound.task;
  if (!(await canDesignChecks(task, actor))) return fail(403, task.type === "QA" ? NO_REVIEW : NO_EDIT);
  if (check.reviewRound.outcome !== null || check.result !== null) return fail(409, "Ya tiene resultado o la ronda está cerrada; no se puede editar.");
  await prisma.reviewCheck.update({
    where: { id: checkId },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.criteria !== undefined ? { criteria: data.criteria?.trim() || null } : {}),
      ...(data.category !== undefined ? { category: data.category?.trim() || null } : {}),
    },
  });
  touch(task);
  return { ok: true as const };
}

export async function addCheckEvidence(checkId: string, actor: Actor, files: FileRef[]) {
  const check = await prisma.reviewCheck.findUnique({ where: { id: checkId }, select: { result: true, reviewRound: { select: { outcome: true, task: { select: { id: true, projectId: true, type: true } } } } } });
  if (!check) return fail(404, "Esa prueba o característica no existe.");
  const task = check.reviewRound.task;
  const [canReview, canEdit] = await Promise.all([canReviewTask(task.id, actor), canEditTask(task.id, actor)]);
  // Prueba: quien revisa; también quien la corrige (asignado) cuando quedó "Con errores". Aceptación: el equipo, mientras el cliente no la califique.
  const allowed = task.type === "QA" ? canReview || (canEdit && check.result === "FAILED") : canEdit && check.result === null;
  if (!allowed) return fail(403, "No se cuenta con permiso para agregar evidencia acá.");
  if (check.reviewRound.outcome !== null && !(task.type === "QA" && check.result === "FAILED")) return fail(409, "La ronda ya está cerrada.");
  for (const f of files) {
    const file = toFile(f);
    await prisma.reviewCheckEvidence.create({ data: { reviewCheckId: checkId, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType } });
  }
  touch(task);
  return { ok: true as const, added: files.length };
}

export async function addRoundDeliverables(roundId: string, actor: Actor, files: FileRef[]) {
  const round = await prisma.reviewRound.findUnique({ where: { id: roundId }, select: { outcome: true, task: { select: { id: true, projectId: true, type: true } } } });
  if (!round) return fail(404, "Esa ronda no existe.");
  if (!(await canEditTask(round.task.id, actor))) return fail(403, NO_EDIT);
  if (round.outcome !== null) return fail(409, "La ronda ya está cerrada.");
  for (const f of files) {
    const file = toFile(f);
    await prisma.reviewDeliverable.create({ data: { reviewRoundId: roundId, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType } });
  }
  touch(round.task);
  return { ok: true as const, added: files.length };
}

// Copia los ítems de una plantilla de pruebas como checks de la ronda (idempotente:
// reaplicar la misma plantilla no duplica lo que ya está).
export async function applyTemplateToRound(roundId: string, actor: Actor, templateId: string) {
  const round = await prisma.reviewRound.findUnique({ where: { id: roundId }, select: { outcome: true, roundNumber: true, task: { select: { id: true, projectId: true, type: true } } } });
  if (!round) return fail(404, "Esa ronda no existe.");
  if (round.task.type !== "QA") return fail(409, "Las plantillas de pruebas solo aplican a tareas de tipo Prueba.");
  if (!(await canReviewTask(round.task.id, actor))) return fail(403, NO_REVIEW);
  if (round.outcome !== null) return fail(409, "La ronda ya está cerrada.");
  const template = await prisma.testTemplate.findUnique({ where: { id: templateId }, include: { items: { orderBy: { order: "asc" } } } });
  if (!template) return fail(404, "Plantilla no encontrada.");
  const existing = await prisma.reviewCheck.findMany({ where: { reviewRoundId: roundId, sourceTemplateItemId: { not: null } }, select: { sourceTemplateItemId: true } });
  const have = new Set(existing.map((c) => c.sourceTemplateItemId));
  const missing = template.items.filter((i) => !have.has(i.id));
  if (missing.length > 0) {
    const count = await prisma.reviewCheck.count({ where: { reviewRoundId: roundId } });
    await prisma.reviewCheck.createMany({
      data: missing.map((item, i) => ({ reviewRoundId: roundId, title: item.title, criteria: item.criteria, category: item.category, order: count + i, sourceTemplateItemId: item.id })),
    });
  }
  touch(round.task);
  return { ok: true as const, added: missing.length };
}

// Diseño completo de una Prueba o una Aceptación en un solo llamado: crea la
// primera ronda si no existe (con sus entregables) y le carga las pruebas o
// características. Si la ronda 1 ya existe y sigue abierta, solo agrega.
export async function designReviewTask(
  taskId: string,
  actor: Actor,
  data: { deliverables?: FileRef[]; templateId?: string; checks?: CheckInput[] }
) {
  const task = await loadTask(taskId);
  if (!task) return fail(404, "La tarea no existe.");
  if (task.type !== "QA" && task.type !== "ACCEPTANCE") return fail(409, "Esta tarea no es de tipo Prueba ni Aceptación.");
  if (!(await canEditTask(taskId, actor)) && !(task.type === "QA" && (await canReviewTask(taskId, actor)))) return fail(403, NO_EDIT);

  let round = await prisma.reviewRound.findFirst({ where: { taskId }, orderBy: { roundNumber: "desc" }, select: { id: true, roundNumber: true, outcome: true } });
  let createdRound = false;
  if (!round) {
    const deliverables = (data.deliverables ?? []).map(toFile);
    // Aceptación no exige entregable para arrancar la ronda (las características que se
    // agregan después son lo que el cliente acepta); Pruebas (QA) sí lo sigue exigiendo.
    if (task.type === "QA" && deliverables.length === 0) return fail(400, "Para crear la primera ronda falta al menos un entregable (archivo subido con /api/upload o un link).");
    const result = task.type === "QA" ? await submitReviewRound(taskId, deliverables, actor) : await submitAcceptanceRound(taskId, deliverables, actor);
    if (!result.ok) return fail(409, result.error);
    round = await prisma.reviewRound.findFirst({ where: { taskId }, orderBy: { roundNumber: "desc" }, select: { id: true, roundNumber: true, outcome: true } });
    createdRound = true;
  } else if (data.deliverables?.length) {
    const r = await addRoundDeliverables(round.id, actor, data.deliverables);
    if (!r.ok) return r;
  }
  if (!round) return fail(500, "No se pudo crear la ronda.");

  let templateAdded = 0;
  if (data.templateId) {
    const r = await applyTemplateToRound(round.id, actor, data.templateId);
    if (!r.ok) return r;
    templateAdded = r.added;
  }
  let checks: { id: string; title: string }[] = [];
  if (data.checks?.length) {
    const r = await addChecksToRound(round.id, actor, data.checks);
    if (!r.ok) return r;
    checks = r.checks;
  }
  return { ok: true as const, roundId: round.id, roundNumber: round.roundNumber, createdRound, templateAdded, checks };
}

// ---------- Adjuntos de la tarea (Insumos y Evidencias) ----------

export async function listTaskAttachments(taskId: string, actor: Actor) {
  const task = await loadTask(taskId);
  if (!task || !canSeeProject(task.project, actor)) return fail(404, "La tarea no existe.");
  const rows = await prisma.attachment.findMany({
    where: { taskId },
    orderBy: { uploadedAt: "asc" },
    include: { uploadedBy: { select: { name: true } } },
  });
  return {
    ok: true as const,
    attachments: rows.map((a) => ({ ...fileOut(a), kind: a.kind, by: a.uploadedBy?.name ?? a.externalUploaderName ?? null, uploadedAt: a.uploadedAt.toISOString() })),
  };
}

export async function addTaskAttachments(taskId: string, actor: Actor, kind: "INSUMO" | "RESULTADO", files: FileRef[]) {
  const task = await loadTask(taskId);
  if (!task) return fail(404, "La tarea no existe.");
  if (!(await canEditTask(taskId, actor))) return fail(403, NO_EDIT);
  if (task.status === "COMPLETED") return fail(409, `La tarea ya está completada — no se puede subir más ${kind === "RESULTADO" ? "evidencia" : "insumos"}.`);
  for (const f of files) {
    const file = toFile(f);
    await prisma.attachment.create({ data: { taskId, kind, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType, uploadedById: actor.id } });
  }
  // Igual que la app: subir evidencia a una tarea sin iniciar la pasa a "En curso".
  if (kind === "RESULTADO") {
    const t = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true, type: true, actualStart: true, steps: { select: { id: true } } } });
    if (t && t.status === "NOT_STARTED" && (t.type === "MILESTONE" || t.type === "QA" || t.steps.length > 0)) {
      await prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS", actualStart: t.actualStart ?? new Date() } });
    }
  }
  touch(task);
  return { ok: true as const, added: files.length };
}

// ---------- Links compartidos ----------

// Compartir una tarea lo puede hacer quien la edita; compartir el proyecto entero, solo PM/admin (igual que la app).
export async function getShareLink(target: { taskId?: string; projectId?: string }) {
  const link = target.taskId ? await getActiveShareLink("TASK", target.taskId) : await getActiveShareLink("PROJECT", target.projectId!);
  return { ok: true as const, active: Boolean(link), token: link?.token ?? null, path: link ? `/share/${link.token}` : null };
}

export async function createShare(target: { taskId?: string; projectId?: string }, actor: Actor) {
  if (target.taskId) {
    const task = await loadTask(target.taskId);
    if (!task) return fail(404, "La tarea no existe.");
    if (!(await canEditTask(target.taskId, actor))) return fail(403, "Solo un asignado, el PM del proyecto o un administrador pueden compartir la tarea.");
    const link = await createShareLink("TASK", target.taskId, actor.id);
    touch(task);
    return { ok: true as const, token: link.token, path: `/share/${link.token}` };
  }
  if (!(await getProjectAdmin(target.projectId!, actor))) return fail(403, "Solo el PM del proyecto o un administrador pueden compartir el proyecto.");
  const link = await createShareLink("PROJECT", target.projectId!, actor.id);
  revalidatePath(`/projects/${target.projectId}`);
  return { ok: true as const, token: link.token, path: `/share/${link.token}` };
}

export async function revokeShare(target: { taskId?: string; projectId?: string }, actor: Actor) {
  const link = target.taskId ? await getActiveShareLink("TASK", target.taskId) : await getActiveShareLink("PROJECT", target.projectId!);
  if (!link) return fail(404, "No hay un link compartido activo.");
  const allowed = target.taskId ? await canEditTask(target.taskId, actor) : Boolean(await getProjectAdmin(target.projectId!, actor));
  if (!allowed) return fail(403, "No se cuenta con permiso para dejar de compartir esto.");
  await revokeShareLink(link.id);
  return { ok: true as const };
}
