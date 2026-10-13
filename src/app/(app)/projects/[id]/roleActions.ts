"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireProjectAdmin, type Actor } from "@/lib/permissions";
import { roleSchema } from "@/lib/projectRoles";

// Roles del equipo en un proyecto (pestaña Definición). Informativo: describe
// quién hace qué acá, sin tocar permisos. Los edita el PM del proyecto (o del
// principal, para un subproyecto) y un administrador — el mismo alcance que
// exige editar el resto de la Definición (requireProjectAdmin).

async function guard(projectId: string, actor?: Actor) {
  try {
    await requireProjectAdmin(projectId, actor);
    return null;
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
}

// Guarda el rol de una persona en el proyecto. Sirve para agregar y para
// editar: la fila es única por persona y proyecto (@@unique), así que la misma
// operación cubre los dos casos sin duplicar.
export async function setProjectRole(
  projectId: string,
  userId: string,
  role: string,
) {
  const denied = await guard(projectId);
  if (denied) return denied;

  const parsed = roleSchema.safeParse(role);
  if (!parsed.success)
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Rol inválido.",
    };

  // La persona tiene que existir y estar activa: no se describen roles de
  // alguien desactivado (tampoco se puede asignar a nada nuevo).
  const user = await prisma.user.findFirst({
    where: { id: userId, active: true },
    select: { id: true },
  });
  if (!user)
    return {
      ok: false as const,
      error: "Esa persona no está disponible en el equipo.",
    };

  await prisma.projectRole.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role: parsed.data },
    update: { role: parsed.data },
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

export async function removeProjectRole(projectId: string, userId: string) {
  const denied = await guard(projectId);
  if (denied) return denied;
  await prisma.projectRole.deleteMany({ where: { projectId, userId } });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

// Cargo general de la persona (Configuración → Usuarios). No es el rol en un
// proyecto: ese vive en ProjectRole y es otro dato.
export async function setUserCargo(userId: string, cargo: string) {
  const parsed = z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .refine((s) => s.length <= 80, {
      message: "El cargo no puede superar los 80 caracteres.",
    })
    .safeParse(cargo);
  if (!parsed.success)
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Cargo inválido.",
    };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return { ok: false as const, error: "Esa persona no existe." };

  await prisma.user.update({
    where: { id: userId },
    data: { cargo: parsed.data || null },
  });
  revalidatePath("/settings");
  revalidatePath("/configuracion");
  return { ok: true as const };
}
