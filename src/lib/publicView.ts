import { prisma } from "@/lib/prisma";
import { getProjectCascadeProgress } from "@/lib/cascadeProgress";
import type { TaskStatus, TaskType } from "@prisma/client";

// DTOs para las vistas compartidas por link (punto 1) — construidos a mano,
// campo por campo, en vez de "traer todo y ocultar en el render": así es
// imposible que un cambio futuro en la UI exponga por accidente algo que no
// debería salir de la app (tiempos reales, asignados, alertas, adjuntos).

export type PublicTask = {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  phaseName: string;
  plannedStart: string;
  plannedEnd: string;
};

export type PublicProject = {
  id: string;
  name: string;
  clientName: string | null;
  description: string | null;
  startDate: string;
  targetEndDate: string | null;
  phases: { id: string; name: string }[];
  tasks: PublicTask[];
};

export async function getPublicProjectData(projectId: string): Promise<PublicProject | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      phases: { orderBy: { order: "asc" } },
      tasks: { include: { phase: true }, orderBy: { plannedStart: "asc" } },
    },
  });
  if (!project) return null;

  return {
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    description: project.description,
    startDate: project.startDate.toISOString(),
    targetEndDate: project.targetEndDate?.toISOString() ?? null,
    phases: project.phases.map((p) => ({ id: p.id, name: p.name })),
    tasks: project.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      type: t.type,
      status: t.status,
      phaseName: t.phase.name,
      plannedStart: t.plannedStart.toISOString(),
      plannedEnd: t.plannedEnd.toISOString(),
    })),
  };
}

export async function getPublicDefinition(projectId: string) {
  const progress = await getProjectCascadeProgress(projectId);
  return {
    objectives: progress.objectives.map((o) => ({ id: o.id, title: o.title, description: o.description, pct: o.pct })),
    requirements: progress.requirements.map((r) => ({ id: r.id, title: r.title, description: r.description, pct: r.pct })),
    phases: progress.phases.map((p) => ({ id: p.id, name: p.name, pct: p.pct })),
  };
}

export async function getPublicTask(taskId: string): Promise<{ project: { id: string; name: string }; task: PublicTask } | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { phase: true, project: { select: { id: true, name: true } } },
  });
  if (!task) return null;
  return {
    project: task.project,
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      status: task.status,
      phaseName: task.phase.name,
      plannedStart: task.plannedStart.toISOString(),
      plannedEnd: task.plannedEnd.toISOString(),
    },
  };
}
