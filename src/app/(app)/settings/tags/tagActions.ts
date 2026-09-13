"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { isPmOrAdminAnywhere, canEditTask, type Actor } from "@/lib/permissions";
import { DEFAULT_COLORS } from "@/components/ProjectIcon";
import { upsertTag } from "@/lib/tags";

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("Solo un administrador puede hacer esto.");
}

async function requirePmOrAdmin() {
  if (!(await isPmOrAdminAnywhere())) {
    throw new Error("Solo un PM o un administrador pueden crear una categoría de etiqueta nueva.");
  }
}

function revalidate() {
  revalidatePath("/settings/tags");
}

// Punto 17: la categoría (contenedor global — nombre, color, emoji) requiere
// permiso de PM/admin para crearse, igual que una plantilla de pruebas
// nueva. Solo un administrador la borra definitivamente.
export async function createTagCategory(formData: FormData) {
  try {
    await requirePmOrAdmin();
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  const name = z.string().trim().min(1).safeParse(formData.get("name"));
  if (!name.success) return { ok: false as const, error: "Ponele un nombre a la categoría." };
  const colorHex = z.string().trim().min(1).safeParse(formData.get("colorHex"));
  if (!colorHex.success || !DEFAULT_COLORS.includes(colorHex.data)) {
    return { ok: false as const, error: "Elegí un color de la paleta." };
  }
  const rawEmoji = formData.get("emoji");
  const emoji = typeof rawEmoji === "string" && rawEmoji.trim() ? rawEmoji.trim() : null;

  await prisma.tagCategory.create({ data: { name: name.data, colorHex: colorHex.data, emoji } });
  revalidate();
  return { ok: true as const };
}

export async function updateTagCategory(categoryId: string, formData: FormData) {
  const name = z.string().trim().min(1).safeParse(formData.get("name"));
  if (!name.success) return { ok: false as const, error: "Ponele un nombre a la categoría." };
  const colorHex = z.string().trim().min(1).safeParse(formData.get("colorHex"));
  if (!colorHex.success || !DEFAULT_COLORS.includes(colorHex.data)) {
    return { ok: false as const, error: "Elegí un color de la paleta." };
  }
  const rawEmoji = formData.get("emoji");
  const emoji = typeof rawEmoji === "string" && rawEmoji.trim() ? rawEmoji.trim() : null;

  await prisma.tagCategory.update({ where: { id: categoryId }, data: { name: name.data, colorHex: colorHex.data, emoji } });
  revalidate();
  return { ok: true as const };
}

export async function deleteTagCategory(categoryId: string) {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  await prisma.tagCategory.delete({ where: { id: categoryId } });
  revalidate();
  return { ok: true as const };
}

// Punto 17: elegir/crear la etiqueta de una tarea para una categoría dada —
// mismo permiso que editar la tarea. Si el nombre no existe todavía en este
// proyecto bajo esa categoría, se crea solo (confirmado con el usuario: cada
// etiqueta nueva queda guardada, pero solo para ese proyecto). Al haber ya
// una etiqueta de esa categoría en la tarea, la reemplaza (una por
// categoría, también confirmado).
export async function setTaskTag(taskId: string, categoryId: string, rawName: string, actor?: Actor) {
  if (!(await canEditTask(taskId, actor))) {
    return { ok: false as const, error: "No tenés permiso para editar esta tarea." };
  }
  const name = z.string().trim().min(1).safeParse(rawName);
  if (!name.success) return { ok: false as const, error: "Escribí un nombre para la etiqueta." };

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true } });

  const tag = await upsertTag(task.projectId, categoryId, name.data);

  await prisma.taskTag.upsert({
    where: { taskId_categoryId: { taskId, categoryId } },
    create: { taskId, categoryId, tagId: tag.id },
    update: { tagId: tag.id },
  });

  revalidatePath(`/projects/${task.projectId}`);
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  return { ok: true as const };
}

export async function removeTaskTag(taskTagId: string, actor?: Actor) {
  const taskTag = await prisma.taskTag.findUniqueOrThrow({ where: { id: taskTagId }, include: { task: true } });
  if (!(await canEditTask(taskTag.taskId, actor))) {
    return { ok: false as const, error: "No tenés permiso para editar esta tarea." };
  }
  await prisma.taskTag.delete({ where: { id: taskTagId } });
  revalidatePath(`/projects/${taskTag.task.projectId}`);
  revalidatePath(`/projects/${taskTag.task.projectId}/tasks/${taskTag.taskId}`);
  return { ok: true as const };
}
