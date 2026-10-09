"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { getAppCountryCode } from "@/lib/appSettings";
import { newSubprojectParentError } from "@/lib/subprojectsServer";

const createProjectSchema = z.object({
  name: z.string().min(1),
  clientName: z.string().optional(),
  startDate: z.coerce.date(),
  pmId: z.string().min(1),
  parentId: z.string().optional(),
});

export async function createProject(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    clientName: formData.get("clientName") || undefined,
    startDate: formData.get("startDate"),
    pmId: formData.get("pmId"),
    parentId: formData.get("parentId") || undefined,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const data = parsed.data;
  // Spec 004: «+ Nuevo subproyecto» — solo quien administra el principal, y el principal no puede ser a su vez subproyecto.
  if (data.parentId) {
    const error = await newSubprojectParentError(data.parentId);
    if (error) return { ok: false as const, error };
  }

  const project = await prisma.project.create({
    data: {
      ...data,
      countryCode: await getAppCountryCode(),
      phases: {
        // ponytail: una fase "General" de arranque — evita bloquear la
        // creación de tareas hasta que el usuario defina sus propias fases.
        create: [{ name: "General", order: 0 }],
      },
    },
  });

  await notify([data.pmId], "ASSIGNED", `Te asignaron el proyecto "${project.name}"`, undefined, `/projects/${project.id}`);

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
