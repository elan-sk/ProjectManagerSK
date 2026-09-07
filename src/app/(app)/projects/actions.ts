"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const createProjectSchema = z.object({
  name: z.string().min(1),
  clientName: z.string().optional(),
  countryCode: z.string().length(2).default("CO"),
  startDate: z.coerce.date(),
  pmId: z.string().min(1),
});

export async function createProject(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const data = createProjectSchema.parse({
    name: formData.get("name"),
    clientName: formData.get("clientName") || undefined,
    countryCode: formData.get("countryCode") || "CO",
    startDate: formData.get("startDate"),
    pmId: formData.get("pmId"),
  });

  const project = await prisma.project.create({
    data: {
      ...data,
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
