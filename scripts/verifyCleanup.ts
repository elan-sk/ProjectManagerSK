import { prisma } from "../src/lib/prisma";

// Limpieza de los proyectos que crean los scripts verify-*. Borrar el proyecto directo falla en MySQL
// (las tareas apuntan a sus fases y la cascada no respeta el orden: "Foreign key constraint violated
// on the fields: (phaseId)"), así que primero las tareas y después el proyecto con lo demás.
export async function deleteTestProject(projectId: string) {
  await prisma.task.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
}
