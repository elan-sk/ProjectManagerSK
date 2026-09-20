"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProjectAdmin, requireProjectAdmin, type Actor } from "@/lib/permissions";
import { notifyAssignment, notifyUrgentTask } from "@/lib/notifications";

// Acciones de Fase 2 sobre tareas y proyectos: urgente, archivar, duplicar,
// combinar, ocultar proyecto y repositorios. Todas re-chequean el permiso en
// el servidor (Admin global o PM del proyecto), igual que el resto de acciones.

type Result = { ok: true; id?: string; count?: number } | { ok: false; error: string };
const fail = (err: unknown): Result => ({ ok: false, error: err instanceof Error ? err.message : "No se pudo completar la acción." });

function refresh(projectId: string, taskId?: string) {
  revalidatePath(`/projects/${projectId}`);
  if (taskId) revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  revalidatePath("/projects");
  revalidatePath("/agenda");
}

// ─── Urgente ────────────────────────────────────────────────────────────
// Solo Admin/PM. Al marcarla se avisa por WhatsApp al instante (ver
// notifyUrgentTask). Sale de la lista del header solo al completarla o
// desmarcarla: no hay "marcar como leída".
export async function setTaskUrgent(taskId: string, urgent: boolean, actor?: Actor): Promise<Result> {
  try {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true, isUrgent: true, status: true } });
    const user = await requireProjectAdmin(task.projectId, actor);
    if (urgent && task.status === "COMPLETED") return { ok: false, error: "Una tarea completada no puede marcarse como urgente." };
    if (task.isUrgent === urgent) return { ok: true, id: taskId };
    await prisma.task.update({ where: { id: taskId }, data: { isUrgent: urgent } });
    if (urgent) await notifyUrgentTask(taskId, user.id).catch((err) => console.error("[urgente] no se pudo notificar", err));
    refresh(task.projectId, taskId);
    return { ok: true, id: taskId };
  } catch (err) {
    return fail(err);
  }
}

// ─── Archivar completadas ───────────────────────────────────────────────
// No borra nada: solo saca la tarea del flujo visual (sigue COMPLETED, en
// consultas, historial y métricas). Solo Admin/PM del proyecto.
export async function archiveCompletedTasks(taskIds: string[], actor?: Actor): Promise<Result> {
  try {
    const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, projectId: true, status: true, archivedAt: true } });
    let count = 0;
    for (const projectId of new Set(tasks.map((t) => t.projectId))) {
      await requireProjectAdmin(projectId, actor);
      const ids = tasks.filter((t) => t.projectId === projectId && t.status === "COMPLETED" && !t.archivedAt).map((t) => t.id);
      if (ids.length === 0) continue;
      await prisma.task.updateMany({ where: { id: { in: ids } }, data: { archivedAt: new Date(), isUrgent: false } });
      count += ids.length;
      refresh(projectId);
    }
    return { ok: true, count };
  } catch (err) {
    return fail(err);
  }
}

export async function unarchiveTask(taskId: string, actor?: Actor): Promise<Result> {
  try {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true } });
    await requireProjectAdmin(task.projectId, actor);
    await prisma.task.update({ where: { id: taskId }, data: { archivedAt: null } });
    refresh(task.projectId, taskId);
    return { ok: true, id: taskId };
  } catch (err) {
    return fail(err);
  }
}

// ─── Duplicar ───────────────────────────────────────────────────────────
// Copia lo que define a la tarea (datos, asignados, revisores, checklist sin
// marcar, etiquetas e insumos). Los insumos comparten el mismo archivo físico
// (no se copia el binario). No copia comentarios, evidencia ni dependencias.
export async function duplicateTask(taskId: string, actor?: Actor): Promise<Result> {
  try {
    const src = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { assignees: true, reviewers: true, steps: { orderBy: { order: "asc" } }, taskTags: true, attachments: { where: { kind: "INSUMO" } } },
    });
    const user = await requireProjectAdmin(src.projectId, actor);
    const copy = await prisma.task.create({
      data: {
        projectId: src.projectId,
        phaseId: src.phaseId,
        type: src.type,
        title: `${src.title} (copia)`,
        description: src.description,
        riskLevel: src.riskLevel,
        plannedStart: src.plannedStart,
        plannedEnd: src.plannedEnd,
        defaultTestTemplateId: src.defaultTestTemplateId,
        assignees: { create: src.assignees.map((a) => ({ userId: a.userId })) },
        reviewers: { create: src.reviewers.map((r) => ({ userId: r.userId })) },
        steps: { create: src.steps.map((s) => ({ description: s.description, order: s.order })) },
        taskTags: { create: src.taskTags.map((t) => ({ tagId: t.tagId, categoryId: t.categoryId })) },
        attachments: {
          create: src.attachments.map((a) => ({ kind: a.kind, fileUrl: a.fileUrl, fileName: a.fileName, mimeType: a.mimeType, uploadedById: user.id })),
        },
      },
    });
    await notifyAssignment(copy.id, src.assignees.map((a) => a.userId), user.id);
    refresh(src.projectId);
    return { ok: true, id: copy.id };
  } catch (err) {
    return fail(err);
  }
}

// ─── Combinar ───────────────────────────────────────────────────────────
// N tareas → 1: cada original pasa a ser un paso del checklist (o, si ya tenía
// checklist, sus pasos se suman al nuevo, con su estado); los comentarios y adjuntos de todas se
// reúnen en la nueva; las dependencias externas se reconectan a la nueva y
// las originales se eliminan. Solo tareas simples/entregables (las de
// Revisión, Ajuste y Aceptación traen historial propio que se perdería).
const MERGEABLE = new Set(["SIMPLE", "MILESTONE"]);

export async function mergeTasks(taskIds: string[], title: string, actor?: Actor): Promise<Result> {
  try {
    const cleanTitle = z.string().trim().min(1, "Escribí el título de la tarea combinada.").max(200).parse(title);
    if (new Set(taskIds).size < 2) return { ok: false, error: "Elegí al menos dos tareas para combinar." };

    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds } },
      include: { assignees: true, taskTags: true, dependsOn: true, blocks: true, steps: { orderBy: { order: "asc" } } },
      orderBy: { plannedStart: "asc" },
    });
    if (tasks.length !== new Set(taskIds).size) return { ok: false, error: "Alguna de las tareas ya no existe." };
    const projectId = tasks[0].projectId;
    if (tasks.some((t) => t.projectId !== projectId)) return { ok: false, error: "Solo se pueden combinar tareas del mismo proyecto." };
    const user = await requireProjectAdmin(projectId, actor);
    if (tasks.some((t) => !MERGEABLE.has(t.type))) {
      return { ok: false, error: "Las tareas de Revisión, Ajuste y Aceptación no se pueden combinar: perderían su historial." };
    }

    const ids = new Set(tasks.map((t) => t.id));
    const allDone = tasks.every((t) => t.status === "COMPLETED");
    const anyStarted = tasks.some((t) => t.status !== "NOT_STARTED");
    const description = tasks
      .filter((t) => t.description)
      .map((t) => `<p><strong>${t.title.replace(/</g, "&lt;")}</strong></p>${t.description}`)
      .join("");

    // Checklist combinado: una original SIN pasos aporta un paso con su título (hecho si estaba
    // completada); una original CON checklist aporta todos sus pasos ("Título: paso"), con su estado.
    const mergedSteps = tasks
      .flatMap((t) =>
        t.steps.length > 0
          ? t.steps.map((st) => ({ description: `${t.title}: ${st.description}`, done: st.done }))
          : [{ description: t.title, done: t.status === "COMPLETED" }]
      )
      .map((st, order) => ({ ...st, order }));

    const tagByCategory = new Map<string, string>();
    for (const t of tasks) for (const tt of t.taskTags) if (!tagByCategory.has(tt.categoryId)) tagByCategory.set(tt.categoryId, tt.tagId);

    const externalPreds = new Map(tasks.flatMap((t) => t.dependsOn).filter((d) => !ids.has(d.predecessorId)).map((d) => [d.predecessorId, d.type] as const));
    const externalSuccs = new Map(tasks.flatMap((t) => t.blocks).filter((d) => !ids.has(d.successorId)).map((d) => [d.successorId, d.type] as const));

    const merged = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          projectId,
          phaseId: tasks[0].phaseId,
          type: "SIMPLE",
          title: cleanTitle,
          description: description || null,
          status: allDone ? "COMPLETED" : anyStarted ? "IN_PROGRESS" : "NOT_STARTED",
          plannedStart: tasks[0].plannedStart,
          plannedEnd: new Date(Math.max(...tasks.map((t) => t.plannedEnd.getTime()))),
          actualStart: tasks.map((t) => t.actualStart).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
          actualEnd: allDone ? new Date(Math.max(...tasks.map((t) => t.actualEnd?.getTime() ?? 0))) : null,
          assignees: { create: [...new Set(tasks.flatMap((t) => t.assignees.map((a) => a.userId)))].map((userId) => ({ userId })) },
          steps: { create: mergedSteps },
          taskTags: { create: [...tagByCategory].map(([categoryId, tagId]) => ({ categoryId, tagId })) },
        },
      });
      // Comentarios, adjuntos y comentarios del link compartido → a la nueva.
      await tx.internalMessage.updateMany({ where: { taskId: { in: [...ids] } }, data: { taskId: created.id } });
      await tx.attachment.updateMany({ where: { taskId: { in: [...ids] } }, data: { taskId: created.id } });
      await tx.shareComment.updateMany({ where: { taskId: { in: [...ids] } }, data: { taskId: created.id } });
      await tx.shareLink.deleteMany({ where: { taskId: { in: [...ids] } } });
      await tx.taskDependency.deleteMany({ where: { OR: [{ predecessorId: { in: [...ids] } }, { successorId: { in: [...ids] } }] } });
      for (const [predecessorId, type] of externalPreds) await tx.taskDependency.create({ data: { predecessorId, successorId: created.id, type } });
      for (const [successorId, type] of externalSuccs) await tx.taskDependency.create({ data: { predecessorId: created.id, successorId, type } });
      await tx.task.deleteMany({ where: { id: { in: [...ids] } } });
      return created;
    });

    await notifyAssignment(merged.id, tasks.flatMap((t) => t.assignees.map((a) => a.userId)), user.id);
    refresh(projectId);
    return { ok: true, id: merged.id };
  } catch (err) {
    return fail(err);
  }
}

// ─── Proyecto oculto (solo admin) ───────────────────────────────────────
export async function setProjectHidden(projectId: string, hidden: boolean): Promise<Result> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return { ok: false, error: "Solo un administrador puede ocultar o mostrar un proyecto." };
  await prisma.project.update({ where: { id: projectId }, data: { hidden } });
  refresh(projectId);
  return { ok: true, id: projectId };
}

// ─── Repositorios múltiples ─────────────────────────────────────────────
const repoUrlSchema = z.string().trim().url("La URL no es válida.").max(190, "La URL es demasiado larga.");

export async function addProjectRepo(projectId: string, url: string): Promise<Result> {
  try {
    if (!(await getProjectAdmin(projectId))) return { ok: false, error: "Solo el PM de este proyecto o un administrador pueden hacer esto." };
    const parsed = repoUrlSchema.safeParse(url);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "La URL no es válida." };
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { repoUrl: true, repos: { select: { url: true } } } });
    if (project.repoUrl === parsed.data || project.repos.some((r) => r.url === parsed.data)) return { ok: false, error: "Ese repositorio ya está vinculado." };
    // El primero que se agrega queda como principal (repoUrl): así el resto de la app y la API v1 siguen viendo uno.
    if (!project.repoUrl) await prisma.project.update({ where: { id: projectId }, data: { repoUrl: parsed.data } });
    else await prisma.projectRepo.create({ data: { projectId, url: parsed.data } });
    refresh(projectId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function removeProjectRepo(projectId: string, url: string): Promise<Result> {
  try {
    if (!(await getProjectAdmin(projectId))) return { ok: false, error: "Solo el PM de este proyecto o un administrador pueden hacer esto." };
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { repoUrl: true, repos: { orderBy: { createdAt: "asc" } } } });
    if (project.repoUrl === url) {
      // Si se quita el principal, el siguiente ocupa su lugar.
      const [next] = project.repos;
      await prisma.project.update({ where: { id: projectId }, data: { repoUrl: next?.url ?? null } });
      if (next) await prisma.projectRepo.delete({ where: { id: next.id } });
    } else {
      await prisma.projectRepo.deleteMany({ where: { projectId, url } });
    }
    refresh(projectId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}


// ─── Reordenar fases ────────────────────────────────────────────────────
export async function reorderPhases(projectId: string, orderedIds: string[], actor?: Actor): Promise<Result> {
  try {
    await requireProjectAdmin(projectId, actor);
    const phases = await prisma.phase.findMany({ where: { projectId }, select: { id: true } });
    const current = new Set(phases.map((p) => p.id));
    if (orderedIds.length !== current.size || new Set(orderedIds).size !== current.size || orderedIds.some((id) => !current.has(id))) {
      return { ok: false, error: "Tenés que indicar todas las fases del proyecto, cada una una sola vez." };
    }
    await prisma.$transaction(orderedIds.map((id, order) => prisma.phase.update({ where: { id }, data: { order } })));
    refresh(projectId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
