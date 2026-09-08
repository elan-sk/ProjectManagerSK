"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// ponytail: por ahora la app solo opera en Colombia (festivos, es-CO en
// fechas) — se deja fijo acá en vez de exponerlo como campo del form, add
// cuando haya un segundo país real.
const PROJECT_COUNTRY_CODE = "CO";

const createProjectSchema = z.object({
  name: z.string().min(1),
  clientName: z.string().optional(),
  startDate: z.coerce.date(),
  pmId: z.string().min(1),
});

export async function createProject(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const data = createProjectSchema.parse({
    name: formData.get("name"),
    clientName: formData.get("clientName") || undefined,
    startDate: formData.get("startDate"),
    pmId: formData.get("pmId"),
  });

  const project = await prisma.project.create({
    data: {
      ...data,
      countryCode: PROJECT_COUNTRY_CODE,
      phases: {
        // ponytail: una fase "General" de arranque — evita bloquear la
        // creación de tareas hasta que el usuario defina sus propias fases.
        create: [{ name: "General", order: 0 }],
      },
    },
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
