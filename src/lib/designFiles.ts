import { prisma } from "@/lib/prisma";

/**
 * Spec 001 (RF-7): archivos de Ajustes (antes, después, insumos) y de las rondas
 * de Prueba/Aceptación (entregables y evidencias), para sumarlos a la vista
 * Archivos con su sección. Solo lectura ahí: se quitan desde su tarea.
 */
export type DesignFile = {
  id: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  section: string;
  uploadedAt: Date;
};

const ADJUSTMENT_SECTION = { BEFORE: "Ajuste · Antes", AFTER: "Ajuste · Después", INSUMO: "Ajuste · Insumo" } as const;

export async function getDesignFiles(projectIds: string[]): Promise<DesignFile[]> {
  if (projectIds.length === 0) return [];
  const task = { select: { id: true, title: true, projectId: true, project: { select: { name: true } } } } as const;
  const file = { id: true, fileUrl: true, fileName: true, mimeType: true, uploadedAt: true } as const;
  const [adjustments, deliverables, evidence] = await Promise.all([
    prisma.adjustmentAttachment.findMany({
      where: { adjustmentItem: { task: { projectId: { in: projectIds } } } },
      select: { ...file, kind: true, adjustmentItem: { select: { task } } },
    }),
    prisma.reviewDeliverable.findMany({
      where: { reviewRound: { task: { projectId: { in: projectIds } } } },
      select: { ...file, reviewRound: { select: { roundNumber: true, task } } },
    }),
    prisma.reviewCheckEvidence.findMany({
      where: { reviewCheck: { reviewRound: { task: { projectId: { in: projectIds } } } } },
      select: { ...file, reviewCheck: { select: { reviewRound: { select: { roundNumber: true, task } } } } },
    }),
  ]);
  const row = (f: { id: string; fileUrl: string; fileName: string; mimeType: string; uploadedAt: Date }, t: { id: string; title: string; projectId: string; project: { name: string } }, section: string): DesignFile => ({
    id: f.id,
    fileUrl: f.fileUrl,
    fileName: f.fileName,
    mimeType: f.mimeType,
    uploadedAt: f.uploadedAt,
    taskId: t.id,
    taskTitle: t.title,
    projectId: t.projectId,
    projectName: t.project.name,
    section,
  });
  return [
    ...adjustments.map((a) => row(a, a.adjustmentItem.task, ADJUSTMENT_SECTION[a.kind])),
    ...deliverables.map((d) => row(d, d.reviewRound.task, `Ronda ${d.reviewRound.roundNumber} · Entregable`)),
    ...evidence.map((e) => row(e, e.reviewCheck.reviewRound.task, `Ronda ${e.reviewCheck.reviewRound.roundNumber} · Evidencia`)),
  ];
}
