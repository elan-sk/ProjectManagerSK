"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isReviewerAnywhere, resolveActor, type Actor } from "@/lib/permissions";

// `actor`: lo pasa la API (/api/v1/test-templates); en la web queda vacío y manda la sesión.
async function requireAdmin(actor?: Actor) {
  const user = await resolveActor(actor);
  if (user?.role !== "ADMIN") throw new Error("Solo un administrador puede hacer esto.");
}

async function requireReviewer(actor?: Actor) {
  if (!(await isReviewerAnywhere(actor))) {
    throw new Error("Solo un revisor, un PM o un administrador pueden hacer esto.");
  }
}

function revalidate() {
  revalidatePath("/settings/tests");
}

// Punto 2.6.1: plantillas de pruebas — crear, renombrar y agregar/editar sus
// pruebas requiere permiso de revisor (admin, PM de algún proyecto, o revisor
// asignado en alguna tarea): decisión 2026-10-04, antes editar quedaba abierto
// a cualquiera y la plantilla «General» que usa el SDD quedaba expuesta.
// Borrar definitivamente (plantilla o ítem) es solo del administrador —
// quitar un ítem de una ronda puntual no pasa por acá, eso vive en
// reviewActions.removeReviewCheck y no toca la plantilla.

export async function createTestTemplate(formData: FormData, actor?: Actor) {
  try {
    await requireReviewer(actor);
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  const parsed = z.string().trim().min(1).safeParse(formData.get("name"));
  if (!parsed.success) return { ok: false as const, error: "Ponele un nombre a la plantilla." };
  const template = await prisma.testTemplate.create({ data: { name: parsed.data } });
  revalidate();
  return { ok: true as const, id: template.id };
}

export async function updateTestTemplate(templateId: string, name: string, actor?: Actor) {
  try {
    await requireReviewer(actor);
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  const parsed = z.string().trim().min(1).safeParse(name);
  if (!parsed.success) return { ok: false as const, error: "Ponele un nombre a la plantilla." };
  await prisma.testTemplate.update({ where: { id: templateId }, data: { name: parsed.data } });
  revalidate();
  return { ok: true as const };
}

export async function deleteTestTemplate(templateId: string, actor?: Actor) {
  try {
    await requireAdmin(actor);
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  await prisma.testTemplate.delete({ where: { id: templateId } });
  revalidate();
  return { ok: true as const };
}

function parseCriteria(formData: FormData) {
  const raw = formData.get("criteria");
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export async function addTestTemplateItem(templateId: string, formData: FormData, actor?: Actor) {
  try {
    await requireReviewer(actor);
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  const title = z.string().trim().min(1).safeParse(formData.get("title"));
  if (!title.success) return { ok: false as const, error: "Ponele un título a la prueba." };
  const category = formData.get("category");
  const count = await prisma.testTemplateItem.count({ where: { templateId } });
  const item = await prisma.testTemplateItem.create({
    data: {
      templateId,
      title: title.data,
      criteria: parseCriteria(formData),
      category: typeof category === "string" && category.trim() ? category.trim() : null,
      order: count,
    },
  });
  revalidate();
  return { ok: true as const, id: item.id };
}

// Edición del texto de un ítem ya creado — misma regla que crear; solo borrar
// definitivamente es de administrador.
export async function updateTestTemplateItem(itemId: string, formData: FormData, actor?: Actor) {
  try {
    await requireReviewer(actor);
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  const title = z.string().trim().min(1).safeParse(formData.get("title"));
  if (!title.success) return { ok: false as const, error: "Ponele un título a la prueba." };
  const category = formData.get("category");
  await prisma.testTemplateItem.update({
    where: { id: itemId },
    data: {
      title: title.data,
      criteria: parseCriteria(formData),
      category: typeof category === "string" && category.trim() ? category.trim() : null,
    },
  });
  revalidate();
  return { ok: true as const };
}

export async function deleteTestTemplateItem(itemId: string, actor?: Actor) {
  try {
    await requireAdmin(actor);
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  await prisma.testTemplateItem.delete({ where: { id: itemId } });
  revalidate();
  return { ok: true as const };
}

// Categorías y respuestas predefinidas para quien corrige: misma regla que las
// plantillas (crear/renombrar/agregar/editar = revisor, PM o admin; borrar = admin).
export async function createResponseCategory(formData: FormData) {
  try {
    await requireReviewer();
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  const parsed = z.string().trim().min(1).safeParse(formData.get("name"));
  if (!parsed.success) return { ok: false as const, error: "Ponele un nombre a la categoría." };
  await prisma.responseCategory.create({ data: { name: parsed.data } });
  revalidate();
  return { ok: true as const };
}

export async function updateResponseCategory(categoryId: string, name: string) {
  try {
    await requireReviewer();
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  const parsed = z.string().trim().min(1).safeParse(name);
  if (!parsed.success) return { ok: false as const, error: "Ponele un nombre a la categoría." };
  await prisma.responseCategory.update({ where: { id: categoryId }, data: { name: parsed.data } });
  revalidate();
  return { ok: true as const };
}

export async function deleteResponseCategory(categoryId: string) {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  await prisma.responseCategory.delete({ where: { id: categoryId } });
  revalidate();
  return { ok: true as const };
}

export async function addResponseTemplate(categoryId: string, formData: FormData) {
  try {
    await requireReviewer();
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  const parsed = z.string().trim().min(1).safeParse(formData.get("text"));
  if (!parsed.success) return { ok: false as const, error: "Escribí el texto de la respuesta." };
  await prisma.responseTemplate.create({ data: { categoryId, text: parsed.data } });
  revalidate();
  return { ok: true as const };
}

export async function updateResponseTemplate(responseId: string, text: string) {
  try {
    await requireReviewer();
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  const parsed = z.string().trim().min(1).safeParse(text);
  if (!parsed.success) return { ok: false as const, error: "Escribí el texto de la respuesta." };
  await prisma.responseTemplate.update({ where: { id: responseId }, data: { text: parsed.data } });
  revalidate();
  return { ok: true as const };
}

export async function deleteResponseTemplate(responseId: string) {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
  await prisma.responseTemplate.delete({ where: { id: responseId } });
  revalidate();
  return { ok: true as const };
}
