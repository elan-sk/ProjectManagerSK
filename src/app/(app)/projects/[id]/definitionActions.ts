"use server";

import { inSection } from "@/lib/attachmentDedup";
import { deleteFileIfUnused } from "@/lib/fileCleanup";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parentObjectiveFrom } from "@/lib/objectiveLink";
import { requireProjectAdmin, type Actor } from "@/lib/permissions";
import { listGroups } from "@/lib/whatsapp";
import { fetchPageTitle } from "@/lib/pageTitle";

async function guard(projectId: string, actor?: Actor) {
  try {
    await requireProjectAdmin(projectId, actor);
    return null;
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
}

export async function updateProjectDescription(projectId: string, formData: FormData) {
  const denied = await guard(projectId);
  if (denied) return denied;

  const raw = formData.get("description");
  const description = typeof raw === "string" && raw.trim() !== "" ? raw : null;

  await prisma.project.update({ where: { id: projectId }, data: { description } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

export async function updateProjectIdentity(projectId: string, formData: FormData) {
  const denied = await guard(projectId);
  if (denied) return denied;

  const parsedName = z.string().trim().min(1, "El nombre no puede estar vacío.").safeParse(formData.get("name"));
  if (!parsedName.success) return { ok: false as const, error: parsedName.error.issues[0]?.message ?? "Nombre inválido." };

  const rawIconUrl = formData.get("iconUrl");
  const iconUrl = typeof rawIconUrl === "string" && rawIconUrl.trim() !== "" ? rawIconUrl : null;

  // Ausente (llamada que no manda el campo) = no se toca; vacío = sin cliente («Interno»).
  const rawClient = formData.get("clientName");
  const clientName = typeof rawClient === "string" ? rawClient.trim() || null : undefined;

  await prisma.project.update({ where: { id: projectId }, data: { name: parsedName.data, iconUrl, clientName } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true as const };
}

export async function projectWhatsAppGroups(projectId: string) {
  const denied = await guard(projectId);
  if (denied) return [];
  return listGroups();
}

export async function updateProjectWhatsAppGroup(projectId: string, groupJid: string, actor?: Actor) {
  const denied = await guard(projectId, actor);
  if (denied) return denied;

  await prisma.project.update({ where: { id: projectId }, data: { whatsappGroupJid: groupJid || null } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

const objectiveSchema = z.object({ title: z.string().min(1), description: z.string().nullable() });

function parseTextField(formData: FormData, name: string) {
  const raw = formData.get(name);
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

export async function addObjective(projectId: string, formData: FormData, actor?: Actor) {
  const denied = await guard(projectId, actor);
  if (denied) return denied;

  const parsed = objectiveSchema.safeParse({
    title: formData.get("title"),
    description: parseTextField(formData, "description"),
  });
  if (!parsed.success) return { ok: false as const, error: "Ponele un título al objetivo." };
  const data = parsed.data;
  const link = await parentObjectiveFrom(projectId, formData);
  if (link.error) return { ok: false as const, error: link.error };
  const count = await prisma.objective.count({ where: { projectId } });
  await prisma.objective.create({ data: { projectId, title: data.title, description: data.description, order: count, parentObjectiveId: link.value ?? null } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

export async function updateObjective(objectiveId: string, formData: FormData, actor?: Actor) {
  const objective = await prisma.objective.findUniqueOrThrow({ where: { id: objectiveId } });
  const denied = await guard(objective.projectId, actor);
  if (denied) return denied;

  const parsed = objectiveSchema.safeParse({
    title: formData.get("title"),
    description: parseTextField(formData, "description"),
  });
  if (!parsed.success) return { ok: false as const, error: "Ponele un título al objetivo." };
  const data = parsed.data;
  const link = await parentObjectiveFrom(objective.projectId, formData);
  if (link.error) return { ok: false as const, error: link.error };
  await prisma.objective.update({
    where: { id: objectiveId },
    data: { title: data.title, description: data.description, ...(link.value !== undefined ? { parentObjectiveId: link.value } : {}) },
  });
  revalidatePath(`/projects/${objective.projectId}`);
  return { ok: true as const };
}

export async function deleteObjective(objectiveId: string, actor?: Actor) {
  const objective = await prisma.objective.findUniqueOrThrow({ where: { id: objectiveId } });
  const denied = await guard(objective.projectId, actor);
  if (denied) return denied;

  await prisma.objective.delete({ where: { id: objectiveId } });
  revalidatePath(`/projects/${objective.projectId}`);
  return { ok: true as const };
}

const requirementSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable(),
  objectiveIds: z.array(z.string()),
});

export async function addRequirement(projectId: string, formData: FormData, actor?: Actor) {
  const denied = await guard(projectId, actor);
  if (denied) return denied;

  const parsed = requirementSchema.safeParse({
    title: formData.get("title"),
    description: parseTextField(formData, "description"),
    objectiveIds: formData.getAll("objectiveIds"),
  });
  if (!parsed.success) return { ok: false as const, error: "Ponele un título al requerimiento." };
  const data = parsed.data;
  const count = await prisma.requirement.count({ where: { projectId } });
  await prisma.requirement.create({
    data: {
      projectId,
      title: data.title,
      description: data.description,
      order: count,
      objectives: { connect: data.objectiveIds.map((id) => ({ id })) },
    },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

export async function updateRequirement(requirementId: string, formData: FormData, actor?: Actor) {
  const requirement = await prisma.requirement.findUniqueOrThrow({ where: { id: requirementId } });
  const denied = await guard(requirement.projectId, actor);
  if (denied) return denied;

  const parsed = requirementSchema.safeParse({
    title: formData.get("title"),
    description: parseTextField(formData, "description"),
    objectiveIds: formData.getAll("objectiveIds"),
  });
  if (!parsed.success) return { ok: false as const, error: "Ponele un título al requerimiento." };
  const data = parsed.data;
  await prisma.requirement.update({
    where: { id: requirementId },
    data: {
      title: data.title,
      description: data.description,
      objectives: { set: data.objectiveIds.map((id) => ({ id })) },
    },
  });
  revalidatePath(`/projects/${requirement.projectId}`);
  return { ok: true as const };
}

export async function deleteRequirement(requirementId: string, actor?: Actor) {
  const requirement = await prisma.requirement.findUniqueOrThrow({ where: { id: requirementId } });
  const denied = await guard(requirement.projectId, actor);
  if (denied) return denied;

  await prisma.requirement.delete({ where: { id: requirementId } });
  revalidatePath(`/projects/${requirement.projectId}`);
  return { ok: true as const };
}

export async function setRequirementTasks(requirementId: string, taskIds: string[], actor?: Actor) {
  const requirement = await prisma.requirement.findUnique({ where: { id: requirementId }, select: { projectId: true } });
  if (!requirement) return { ok: false as const, error: "Ese requerimiento ya no existe." };
  const denied = await guard(requirement.projectId, actor);
  if (denied) return denied;

  const ids = [...new Set(taskIds)];
  const valid = await prisma.task.count({ where: { id: { in: ids }, projectId: requirement.projectId } });
  if (valid !== ids.length) return { ok: false as const, error: "Alguna de las tareas elegidas no pertenece a este proyecto." };

  try {
    await prisma.requirement.update({ where: { id: requirementId }, data: { tasks: { set: ids.map((id) => ({ id })) } } });
  } catch {
    return { ok: false as const, error: "No se pudieron guardar las tareas del requerimiento. Conviene intentarlo de nuevo." };
  }
  revalidatePath(`/projects/${requirement.projectId}`);
  return { ok: true as const };
}

export async function setObjectiveRequirements(objectiveId: string, requirementIds: string[], actor?: Actor) {
  const objective = await prisma.objective.findUnique({ where: { id: objectiveId }, select: { projectId: true } });
  if (!objective) return { ok: false as const, error: "Ese objetivo ya no existe." };
  const denied = await guard(objective.projectId, actor);
  if (denied) return denied;

  const ids = [...new Set(requirementIds)];
  const valid = await prisma.requirement.count({ where: { id: { in: ids }, projectId: objective.projectId } });
  if (valid !== ids.length) return { ok: false as const, error: "Alguno de los requerimientos elegidos no pertenece a este proyecto." };

  try {
    await prisma.objective.update({ where: { id: objectiveId }, data: { requirements: { set: ids.map((id) => ({ id })) } } });
  } catch {
    return { ok: false as const, error: "No se pudieron guardar los requerimientos del objetivo. Conviene intentarlo de nuevo." };
  }
  revalidatePath(`/projects/${objective.projectId}`);
  return { ok: true as const };
}

export async function setPhaseTasks(phaseId: string, taskIds: string[], actor?: Actor) {
  const phase = await prisma.phase.findUnique({ where: { id: phaseId }, select: { projectId: true } });
  if (!phase) return { ok: false as const, error: "Esa fase ya no existe." };
  const denied = await guard(phase.projectId, actor);
  if (denied) return denied;

  const ids = [...new Set(taskIds)];
  const valid = await prisma.task.count({ where: { id: { in: ids }, projectId: phase.projectId } });
  if (valid !== ids.length) return { ok: false as const, error: "Alguna de las tareas elegidas no pertenece a este proyecto." };

  try {
    await prisma.task.updateMany({ where: { id: { in: ids }, phaseId: { not: phaseId } }, data: { phaseId } });
  } catch {
    return { ok: false as const, error: "No se pudieron mover las tareas a la fase. Conviene intentarlo de nuevo." };
  }
  revalidatePath(`/projects/${phase.projectId}`);
  return { ok: true as const };
}

const phaseSchema = z.object({ name: z.string().min(1), requirementIds: z.array(z.string()) });

export async function updatePhase(phaseId: string, formData: FormData, actor?: Actor) {
  const phase = await prisma.phase.findUniqueOrThrow({ where: { id: phaseId } });
  const denied = await guard(phase.projectId, actor);
  if (denied) return denied;

  const parsed = phaseSchema.safeParse({
    name: formData.get("name"),
    requirementIds: formData.getAll("requirementIds"),
  });
  if (!parsed.success) return { ok: false as const, error: "Ponele un nombre a la fase." };
  const data = parsed.data;
  await prisma.phase.update({
    where: { id: phaseId },
    data: {
      name: data.name,
      ...(formData.get("syncRequirements") === "1" ? { requirements: { set: data.requirementIds.map((id) => ({ id })) } } : {}),
    },
  });
  revalidatePath(`/projects/${phase.projectId}`);
  return { ok: true as const };
}

export async function deletePhase(phaseId: string, actor?: Actor) {
  const phase = await prisma.phase.findUniqueOrThrow({ where: { id: phaseId } });
  const denied = await guard(phase.projectId, actor);
  if (denied) return denied;

  // Task.phaseId es obligatorio (sin onDelete en el schema, o sea Restrict) —
  // borrar una fase con tareas rompería esa referencia. Se valida antes en
  // vez de dejar que truene la constraint, para dar un mensaje claro.
  const taskCount = await prisma.task.count({ where: { phaseId } });
  if (taskCount > 0) {
    return {
      ok: false as const,
      error: `No se puede eliminar: tiene ${taskCount} tarea${taskCount === 1 ? "" : "s"} asignada${taskCount === 1 ? "" : "s"}. Movela o eliminala primero.`,
    };
  }

  await prisma.phase.delete({ where: { id: phaseId } });
  revalidatePath(`/projects/${phase.projectId}`);
  return { ok: true as const };
}

// Punto 3.2: archivos y enlaces importantes del proyecto — se prioriza el
// link sobre subir el archivo, para no llenar la app de contenido que puede
// vivir en un servicio externo (Drive, Figma, repo).
const projectLinkSchema = z.object({
  title: z.string().trim(),
  url: z.string().trim().url(),
});

export async function addProjectLink(projectId: string, formData: FormData, actor?: Actor) {
  const denied = await guard(projectId, actor);
  if (denied) return denied;

  const parsed = projectLinkSchema.safeParse({
    title: formData.get("title"),
    url: formData.get("url"),
  });
  if (!parsed.success) return { ok: false as const, error: "Completá un link válido (con https://)." };

  // Sin nombre se usa el título de la página; si no se logra obtener, se pide el nombre.
  const title = parsed.data.title || (await fetchPageTitle(parsed.data.url));
  if (!title) return { ok: false as const, error: "No se pudo obtener el nombre de ese link. Escribí uno." };

  if (await inSection({ projectId, links: true }, parsed.data.url)) return { ok: true as const, duplicate: true as const };
  await prisma.projectLink.create({ data: { projectId, title, url: parsed.data.url } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

export async function removeProjectLink(linkId: string, actor?: Actor) {
  const link = await prisma.projectLink.findUnique({ where: { id: linkId } });
  if (!link) return { ok: false as const, error: "Ese link ya no existe." };
  const denied = await guard(link.projectId, actor);
  if (denied) return denied;

  await prisma.projectLink.delete({ where: { id: linkId } });
  revalidatePath(`/projects/${link.projectId}`);
  return { ok: true as const };
}

export async function addProjectAttachment(projectId: string, file: { url: string; name: string; mimeType: string }, actor?: Actor) {
  let user;
  try {
    user = await requireProjectAdmin(projectId, actor);
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }

  if (await inSection({ projectId }, file.url)) return { ok: true as const, duplicate: true as const };
  await prisma.projectAttachment.create({
    data: { projectId, fileUrl: file.url, fileName: file.name, mimeType: file.mimeType, uploadedById: user.id },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

export async function removeProjectAttachment(attachmentId: string, actor?: Actor) {
  const attachment = await prisma.projectAttachment.findUniqueOrThrow({ where: { id: attachmentId } });
  const denied = await guard(attachment.projectId, actor);
  if (denied) return denied;

  await prisma.projectAttachment.delete({ where: { id: attachmentId } });
  await deleteFileIfUnused(attachment.fileUrl);
  revalidatePath(`/projects/${attachment.projectId}`);
  return { ok: true as const };
}
