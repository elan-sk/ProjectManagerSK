import { prisma } from "@/lib/prisma";
import { canSeeProject, type Actor } from "@/lib/permissions";

// ¿Puede esta persona ver el proyecto? (los ocultos: solo el administrador que es su PM).
// Un id que no existe también devuelve false, para responder 404 sin distinguir.
export async function projectVisibleTo(projectId: string, actor: Actor) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { hidden: true, pmId: true } });
  return Boolean(project && canSeeProject(project, actor));
}

export async function taskVisibleTo(taskId: string, actor: Actor) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { project: { select: { hidden: true, pmId: true } } } });
  return Boolean(task && canSeeProject(task.project, actor));
}
