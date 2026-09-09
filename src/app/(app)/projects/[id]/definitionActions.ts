"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireProjectAdmin } from "@/lib/permissions";

async function guard(projectId: string) {
  try {
    await requireProjectAdmin(projectId);
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

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function updateProjectIdentity(projectId: string, formData: FormData) {
  const denied = await guard(projectId);
  if (denied) return denied;

  const rawColor = formData.get("color");
  const rawIconUrl = formData.get("iconUrl");
  const color = typeof rawColor === "string" && HEX_COLOR.test(rawColor) ? rawColor : null;
  const iconUrl = typeof rawIconUrl === "string" && rawIconUrl.trim() !== "" ? rawIconUrl : null;

  await prisma.project.update({ where: { id: projectId }, data: { color, iconUrl } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true as const };
}

const objectiveSchema = z.object({ title: z.string().min(1), description: z.string().nullable() });

function parseTextField(formData: FormData, name: string) {
  const raw = formData.get(name);
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

export async function addObjective(projectId: string, formData: FormData) {
  const denied = await guard(projectId);
  if (denied) return denied;

  const data = objectiveSchema.parse({
    title: formData.get("title"),
    description: parseTextField(formData, "description"),
  });
  const count = await prisma.objective.count({ where: { projectId } });
  await prisma.objective.create({ data: { projectId, title: data.title, description: data.description, order: count } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

export async function updateObjective(objectiveId: string, formData: FormData) {
  const objective = await prisma.objective.findUniqueOrThrow({ where: { id: objectiveId } });
  const denied = await guard(objective.projectId);
  if (denied) return denied;

  const data = objectiveSchema.parse({
    title: formData.get("title"),
    description: parseTextField(formData, "description"),
  });
  await prisma.objective.update({ where: { id: objectiveId }, data: { title: data.title, description: data.description } });
  revalidatePath(`/projects/${objective.projectId}`);
  return { ok: true as const };
}

export async function deleteObjective(objectiveId: string) {
  const objective = await prisma.objective.findUniqueOrThrow({ where: { id: objectiveId } });
  const denied = await guard(objective.projectId);
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

export async function addRequirement(projectId: string, formData: FormData) {
  const denied = await guard(projectId);
  if (denied) return denied;

  const data = requirementSchema.parse({
    title: formData.get("title"),
    description: parseTextField(formData, "description"),
    objectiveIds: formData.getAll("objectiveIds"),
  });
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

export async function updateRequirement(requirementId: string, formData: FormData) {
  const requirement = await prisma.requirement.findUniqueOrThrow({ where: { id: requirementId } });
  const denied = await guard(requirement.projectId);
  if (denied) return denied;

  const data = requirementSchema.parse({
    title: formData.get("title"),
    description: parseTextField(formData, "description"),
    objectiveIds: formData.getAll("objectiveIds"),
  });
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

export async function deleteRequirement(requirementId: string) {
  const requirement = await prisma.requirement.findUniqueOrThrow({ where: { id: requirementId } });
  const denied = await guard(requirement.projectId);
  if (denied) return denied;

  await prisma.requirement.delete({ where: { id: requirementId } });
  revalidatePath(`/projects/${requirement.projectId}`);
  return { ok: true as const };
}

export async function updatePhaseRequirements(phaseId: string, formData: FormData) {
  const phase = await prisma.phase.findUniqueOrThrow({ where: { id: phaseId } });
  const denied = await guard(phase.projectId);
  if (denied) return denied;

  const requirementIds = formData.getAll("requirementIds") as string[];
  await prisma.phase.update({
    where: { id: phaseId },
    data: { requirements: { set: requirementIds.map((id) => ({ id })) } },
  });
  revalidatePath(`/projects/${phase.projectId}`);
  return { ok: true as const };
}
