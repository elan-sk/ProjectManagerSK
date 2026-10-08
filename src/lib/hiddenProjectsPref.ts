import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { visibleProjectWhere, type Actor } from "@/lib/permissions";
import { SHOW_HIDDEN_PROJECTS_COOKIE } from "@/lib/viewCookie";

/**
 * Vistas generales (Panorama general de Proyectos y Agenda): las tareas de proyectos ocultos no
 * salen salvo que la persona active «Incluir proyectos ocultos» (queda guardado en una cookie).
 * Entrando al proyecto se ven siempre. `canToggle`: solo quien ve algún proyecto oculto tiene el botón.
 * `projectWhere`: reemplaza a visibleProjectWhere en esas consultas.
 */
export async function hiddenProjectsPref(user: Actor) {
  const canToggle = (await prisma.project.count({ where: { hidden: true, ...visibleProjectWhere(user) } })) > 0;
  const include = canToggle && (await cookies()).get(SHOW_HIDDEN_PROJECTS_COOKIE)?.value === "1";
  return { canToggle, include, projectWhere: { ...visibleProjectWhere(user), ...(include ? {} : { hidden: false }) } };
}
