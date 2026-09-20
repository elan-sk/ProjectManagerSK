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
  const [progress, phaseTasks, comments] = await Promise.all([
    getProjectCascadeProgress(projectId),
    // Solo título — el resto de PhaseSummary (holgura, variación, tareas
    // atrasadas) es información interna que nunca debe salir por el link
    // compartido (punto 15: acá solo se agregan los títulos de tarea).
    prisma.phase.findMany({
      where: { projectId },
      select: { id: true, tasks: { select: { title: true }, orderBy: { plannedStart: "asc" } } },
    }),
    // Punto 4: comentarios generales de la pestaña Definición — mismo
    // ShareComment que ya existe para tareas, ahora colgado de projectId en
    // vez de taskId (ver PublicCommentThread/shareActions.ts).
    prisma.shareComment.findMany({
      where: { projectId, parentId: null },
      include: { attachments: true, poll: { include: { options: { orderBy: { order: "asc" } } } }, replies: { include: { attachments: true }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const taskTitlesByPhaseId = new Map(phaseTasks.map((p) => [p.id, p.tasks.map((t) => t.title)]));
  return {
    objectives: progress.objectives.map((o) => ({ id: o.id, title: o.title, description: o.description, pct: o.pct })),
    requirements: progress.requirements.map((r) => ({ id: r.id, title: r.title, description: r.description, pct: r.pct })),
    phases: progress.phases.map((p) => ({ id: p.id, name: p.name, pct: p.pct, taskTitles: taskTitlesByPhaseId.get(p.id) ?? [] })),
    comments: comments.map(toPublicCommentWithReplies),
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

// A diferencia de QA (nunca expone reviewRounds/checks, ver comentario en
// getPublicTask), Aceptación SÍ los expone a propósito: es la lista de
// características que el cliente tiene que ir aceptando o devolviendo.
export type PublicAcceptanceItem = {
  id: string;
  title: string;
  criteria: string | null;
  category: string | null;
  result: "APPROVED" | "FAILED" | null;
  note: string | null;
  reviewedByName: string | null;
  reviewedByRole: string | null;
  evidence: PublicFile[];
  /** Hilo del cliente sobre esta característica; se cierra al calificarla. */
  comments: PublicCommentWithReplies[];
};
export type PublicAcceptanceRound = {
  id: string;
  roundNumber: number;
  submittedAt: string;
  outcome: "APPROVED" | "RETURNED" | null;
  deliverables: PublicFile[];
  items: PublicAcceptanceItem[];
};

export type PublicAdjustmentItem = {
  id: string;
  description: string;
  note: string | null;
  answered: boolean;
  clientApproval: boolean | null;
  clientApprovalAt: string | null;
  clientApprovalBy: string | null;
  /** El cliente puede calificar este cambio (se cierra al enviar la revisión; solo el equipo lo reabre). */
  reviewOpen: boolean;
  before: PublicFile[];
  after: PublicFile[];
  comments: PublicCommentWithReplies[];
};

// Pregunta del equipo: el externo solo recibe el enunciado y las opciones, nunca votos ni resultados.
export type PublicPoll = { id: string; multiple: boolean; closed: boolean; options: { id: string; label: string }[] };

export type PublicComment = {
  id: string;
  authorName: string;
  authorRole: string | null;
  body: string;
  createdAt: string;
  attachments: PublicFile[];
  poll: PublicPoll | null;
};
// Punto 4: una respuesta (un solo nivel de anidamiento, no hilos recursivos).
export type PublicCommentWithReplies = PublicComment & { replies: PublicComment[] };

type CommentRow = {
  id: string;
  authorName: string;
  authorRole: string | null;
  body: string;
  createdAt: Date;
  attachments?: { id: string; fileUrl: string; fileName: string; mimeType: string }[];
  poll?: { id: string; multiple: boolean; closed: boolean; options: { id: string; label: string }[] } | null;
};

const toPublicComment = (c: CommentRow): PublicComment => ({
  id: c.id,
  authorName: c.authorName,
  authorRole: c.authorRole,
  body: c.body,
  createdAt: c.createdAt.toISOString(),
  attachments: (c.attachments ?? []).map((a) => ({ id: a.id, url: a.fileUrl, name: a.fileName, mimeType: a.mimeType })),
  poll: c.poll ? { id: c.poll.id, multiple: c.poll.multiple, closed: c.poll.closed, options: c.poll.options.map((o) => ({ id: o.id, label: o.label })) } : null,
});

function toPublicCommentWithReplies(c: CommentRow & { replies: CommentRow[] }): PublicCommentWithReplies {
  return { ...toPublicComment(c), replies: c.replies.map(toPublicComment) };
}

// Punto 16 confirmado con el usuario: para tipo Prueba (QA) nunca se traen
// reviewRounds/checks acá — son datos internos privados, solo sale la
// descripción de la tarea (igual que cualquier otro tipo).
export async function getPublicTask(taskId: string): Promise<{
  project: { id: string; name: string; iconUrl: string | null };
  task: PublicTask;
  insumos: PublicFile[];
  evidencia: PublicFile[];
  adjustmentItems: PublicAdjustmentItem[];
  acceptanceRounds: PublicAcceptanceRound[];
  comments: PublicCommentWithReplies[];
} | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      phase: true,
      project: { select: { id: true, name: true, iconUrl: true } },
      attachments: true,
      adjustmentItems: {
        include: {
          attachments: true,
          shareComments: {
            where: { parentId: null },
            include: { attachments: true, poll: { include: { options: { orderBy: { order: "asc" } } } }, replies: { include: { attachments: true }, orderBy: { createdAt: "asc" } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
      // Aceptación (a propósito, a diferencia de QA — ver comentario debajo):
      // el cliente necesita ver la lista de características para poder
      // aceptarlas o devolverlas.
      reviewRounds: {
        orderBy: { roundNumber: "desc" },
        include: {
          deliverables: true,
          checks: {
            include: {
              evidence: true,
              shareComments: {
                where: { parentId: null },
                include: { attachments: true, poll: { include: { options: { orderBy: { order: "asc" } } } }, replies: { include: { attachments: true }, orderBy: { createdAt: "asc" } } },
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { order: "asc" },
          },
        },
      },
      shareComments: {
        where: { adjustmentItemId: null, reviewCheckId: null, parentId: null },
        include: { attachments: true, poll: { include: { options: { orderBy: { order: "asc" } } } }, replies: { include: { attachments: true }, orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!task) return null;

  const toFile = (a: { id: string; fileUrl: string; fileName: string; mimeType: string }): PublicFile => ({
    id: a.id,
    url: a.fileUrl,
    name: a.fileName,
    mimeType: a.mimeType,
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
      clientApproval: item.clientApproval,
      clientApprovalAt: item.clientApprovalAt?.toISOString() ?? null,
      clientApprovalBy: item.clientApprovalBy,
      reviewOpen: item.clientReviewOpen,
      before: item.attachments.filter((a) => a.kind === "BEFORE").map(toFile),
      after: item.attachments.filter((a) => a.kind === "AFTER").map(toFile),
      comments: item.shareComments.map(toPublicCommentWithReplies),
    })),
    acceptanceRounds:
      task.type === "ACCEPTANCE"
        ? task.reviewRounds.map((round) => ({
            id: round.id,
            roundNumber: round.roundNumber,
            submittedAt: round.submittedAt.toISOString(),
            outcome: round.outcome,
            deliverables: round.deliverables.map(toFile),
            items: round.checks.map((c) => ({
              id: c.id,
              title: c.title,
              criteria: c.criteria,
              category: c.category,
              result: c.result as "APPROVED" | "FAILED" | null,
              note: c.note,
              reviewedByName: c.externalReviewerName,
              reviewedByRole: c.externalReviewerRole,
              evidence: c.evidence.map(toFile),
              comments: c.shareComments.map(toPublicCommentWithReplies),
            })),
          }))
        : [],
    comments: task.shareComments.map(toPublicCommentWithReplies),
  };
}
