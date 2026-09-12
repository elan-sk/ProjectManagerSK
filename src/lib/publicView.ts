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
  iconUrl: string | null;
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
    iconUrl: project.iconUrl,
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
  const [progress, phaseTasks] = await Promise.all([
    getProjectCascadeProgress(projectId),
    // Solo título — el resto de PhaseSummary (holgura, variación, tareas
    // atrasadas) es información interna que nunca debe salir por el link
    // compartido (punto 15: acá solo se agregan los títulos de tarea).
    prisma.phase.findMany({
      where: { projectId },
      select: { id: true, tasks: { select: { title: true }, orderBy: { plannedStart: "asc" } } },
    }),
  ]);
  const taskTitlesByPhaseId = new Map(phaseTasks.map((p) => [p.id, p.tasks.map((t) => t.title)]));
  return {
    objectives: progress.objectives.map((o) => ({ id: o.id, title: o.title, description: o.description, pct: o.pct })),
    requirements: progress.requirements.map((r) => ({ id: r.id, title: r.title, description: r.description, pct: r.pct })),
    phases: progress.phases.map((p) => ({ id: p.id, name: p.name, pct: p.pct, taskTitles: taskTitlesByPhaseId.get(p.id) ?? [] })),
  };
}

export type PublicFile = { id: string; url: string; name: string; mimeType: string };

export async function getPublicProjectFiles(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      attachments: { orderBy: { uploadedAt: "asc" } },
      links: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) return { attachments: [] as PublicFile[], links: [] as { id: string; title: string; url: string }[] };
  return {
    attachments: project.attachments.map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType })),
    links: project.links.map((l) => ({ id: l.id, title: l.title, url: l.url })),
  };
}

export type PublicAdjustmentItem = {
  id: string;
  description: string;
  note: string | null;
  answered: boolean;
  before: PublicFile[];
  after: PublicFile[];
  comments: PublicComment[];
};

export type PublicComment = { id: string; authorName: string; authorRole: string | null; body: string; createdAt: string };

// Punto 16 confirmado con el usuario: para tipo Prueba (QA) nunca se traen
// reviewRounds/checks acá — son datos internos privados, solo sale la
// descripción de la tarea (igual que cualquier otro tipo).
export async function getPublicTask(taskId: string): Promise<{
  project: { id: string; name: string; iconUrl: string | null };
  task: PublicTask;
  insumos: PublicFile[];
  evidencia: PublicFile[];
  adjustmentItems: PublicAdjustmentItem[];
  comments: PublicComment[];
} | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      phase: true,
      project: { select: { id: true, name: true, iconUrl: true } },
      attachments: true,
      adjustmentItems: {
        include: { attachments: true, shareComments: { orderBy: { createdAt: "asc" } } },
        orderBy: { order: "asc" },
      },
      shareComments: { where: { adjustmentItemId: null }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!task) return null;

  const toFile = (a: { id: string; fileUrl: string; fileName: string; mimeType: string }): PublicFile => ({
    id: a.id,
    url: a.fileUrl,
    name: a.fileName,
    mimeType: a.mimeType,
  });
  const toComment = (c: { id: string; authorName: string; authorRole: string | null; body: string; createdAt: Date }): PublicComment => ({
    id: c.id,
    authorName: c.authorName,
    authorRole: c.authorRole,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
  });

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
    insumos: task.attachments.filter((a) => a.kind === "INSUMO").map(toFile),
    evidencia: task.attachments.filter((a) => a.kind === "RESULTADO").map(toFile),
    adjustmentItems: task.adjustmentItems.map((item) => ({
      id: item.id,
      description: item.description,
      note: item.note,
      answered: Boolean(item.note) || item.attachments.some((a) => a.kind === "AFTER"),
      before: item.attachments.filter((a) => a.kind === "BEFORE").map(toFile),
      after: item.attachments.filter((a) => a.kind === "AFTER").map(toFile),
      comments: item.shareComments.map(toComment),
    })),
    comments: task.shareComments.map(toComment),
  };
}
