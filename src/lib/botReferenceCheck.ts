import { prisma } from "@/lib/prisma";
import { getAccessibleProjectIds } from "@/lib/chontatecTools";

/**
 * Antes de mostrar «Confirmar», comprueba que todo lo que nombra un plan del bot exista
 * (personas, tareas, proyectos, fases…). Si algo falta, el bot no muestra el plan: recibe
 * qué no se encontró y opciones válidas para proponerle a la persona.
 * Motivo: 2026-11-17 un plan de 38 cambios traía un responsable inexistente y la
 * confirmación se cortó a mitad, con parte de los cambios ya aplicados.
 */

type Kind = "user" | "task" | "project" | "phase" | "tag" | "tagCategory" | "client" | "testTemplate" | "objective" | "requirement" | "dependency" | "step" | "poll" | "pollOption" | "learning" | "attachment" | "templateItem" | "adjustmentItem" | "reviewCheck" | "reviewRound";

// Campo del input → qué es. Los ids ambiguos (targetId, itemId, parentId de un comentario) no se revisan.
const KEY_KIND: Record<string, Kind> = {
  userId: "user", addUserId: "user", removeUserId: "user", pmId: "user", assigneeIds: "user", reviewerIds: "user", mentionUserIds: "user",
  taskId: "task", predecessorId: "task",
  projectId: "project",
  phaseId: "phase", orderedPhaseIds: "phase",
  tagId: "tag", categoryId: "tagCategory",
  clientId: "client",
  templateId: "testTemplate", defaultTestTemplateId: "testTemplate",
  objectiveId: "objective", parentObjectiveId: "objective", objectiveIds: "objective",
  requirementId: "requirement", requirementIds: "requirement",
  dependencyId: "dependency", stepId: "step", pollId: "poll", optionIds: "pollOption",
  learningId: "learning", attachmentId: "attachment",
};
// Campos cuyo significado depende de la herramienta. parentId de un comentario no se revisa (puede ser de varios hilos).
const TARGET_BY_SCOPE: Record<string, Kind> = { adjustment_item: "adjustmentItem", acceptance_check: "reviewCheck", qa_check: "reviewCheck", round: "reviewRound" };
function kindFor(tool: string, key: string, input: Record<string, unknown>): Kind | undefined {
  if (key === "parentId") return tool === "create_project" || tool === "update_project" ? "project" : undefined;
  if (key === "itemId") return tool === "manage_test_template" ? "templateItem" : tool === "manage_design_item" ? "adjustmentItem" : undefined;
  if (key === "checkId") return "reviewCheck";
  if (key === "roundId") return "reviewRound";
  if (key === "targetId") return TARGET_BY_SCOPE[String(input.scope)];
  return KEY_KIND[key];
}

const LABEL: Record<Kind, string> = {
  user: "la persona", task: "la tarea", project: "el proyecto", phase: "la fase", tag: "la etiqueta", tagCategory: "la categoría de etiquetas",
  client: "el cliente", testTemplate: "la plantilla de pruebas", objective: "el objetivo", requirement: "el requerimiento", dependency: "la dependencia",
  step: "el paso", poll: "la pregunta", pollOption: "la opción", learning: "el aprendizaje", attachment: "el archivo",
  templateItem: "la prueba de la plantilla", adjustmentItem: "el cambio del ajuste", reviewCheck: "la prueba o característica", reviewRound: "la ronda",
};

type Ref = { kind: Kind; id: string };
export type Use = { id: string; name: string; input: unknown };

function refsOf(name: string, input: unknown, out: Ref[] = []): Ref[] {
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const kind = kindFor(name, key, input as Record<string, unknown>);
    const ids = typeof value === "string" ? [value] : Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : [];
    // Vacío = «quitar» (cliente, proyecto principal…): no es una referencia.
    if (kind) for (const id of ids) if (id.trim()) out.push({ kind, id });
    if (value && typeof value === "object") (Array.isArray(value) ? value : [value]).forEach((v) => refsOf(name, v, out));
  }
  return out;
}

async function existing(kind: Kind, ids: string[]): Promise<Set<string>> {
  const where = { id: { in: ids } };
  const select = { id: true } as const;
  const rows: { id: string }[] = await {
    user: () => prisma.user.findMany({ where: { ...where, active: true, deletedAt: null }, select }),
    task: () => prisma.task.findMany({ where, select }),
    project: () => prisma.project.findMany({ where, select }),
    phase: () => prisma.phase.findMany({ where, select }),
    tag: () => prisma.tag.findMany({ where, select }),
    tagCategory: () => prisma.tagCategory.findMany({ where, select }),
    client: () => prisma.client.findMany({ where, select }),
    testTemplate: () => prisma.testTemplate.findMany({ where, select }),
    objective: () => prisma.objective.findMany({ where, select }),
    requirement: () => prisma.requirement.findMany({ where, select }),
    dependency: () => prisma.taskDependency.findMany({ where, select }),
    step: () => prisma.taskStep.findMany({ where, select }),
    poll: () => prisma.sharePoll.findMany({ where, select }),
    pollOption: () => prisma.sharePollOption.findMany({ where, select }),
    learning: () => prisma.learning.findMany({ where, select }),
    attachment: () => prisma.attachment.findMany({ where, select }),
    templateItem: () => prisma.testTemplateItem.findMany({ where, select }),
    adjustmentItem: () => prisma.adjustmentItem.findMany({ where, select }),
    reviewCheck: () => prisma.reviewCheck.findMany({ where, select }),
    reviewRound: () => prisma.reviewRound.findMany({ where, select }),
  }[kind]();
  return new Set(rows.map((r) => r.id));
}

const MAX_OPTIONS = 40;
const list = (rows: { id: string; name?: string; title?: string }[]) => rows.map((r) => `${r.name ?? r.title} (id ${r.id})`).join("; ");

// Opciones válidas para lo que faltó, acotadas a los proyectos del plan y a lo que la persona puede ver.
async function alternatives(kind: Kind, projectIds: string[], userId: string): Promise<string> {
  const inProjects = projectIds.length ? { projectId: { in: projectIds } } : null;
  switch (kind) {
    case "user":
      return list(await prisma.user.findMany({ where: { active: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: MAX_OPTIONS }));
    case "project": {
      const accessible = await getAccessibleProjectIds(userId);
      return list(await prisma.project.findMany({ where: { archivedAt: null, ...(accessible ? { id: { in: accessible } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: MAX_OPTIONS }));
    }
    case "task":
      return inProjects ? list(await prisma.task.findMany({ where: inProjects, select: { id: true, title: true }, orderBy: { plannedStart: "asc" }, take: MAX_OPTIONS })) : "";
    case "phase":
      return inProjects ? list(await prisma.phase.findMany({ where: inProjects, select: { id: true, name: true }, orderBy: { order: "asc" } })) : "";
    case "tag":
      return inProjects ? list(await prisma.tag.findMany({ where: inProjects, select: { id: true, name: true }, take: MAX_OPTIONS })) : "";
    case "objective":
      return inProjects ? list(await prisma.objective.findMany({ where: inProjects, select: { id: true, title: true }, take: MAX_OPTIONS })) : "";
    case "requirement":
      return inProjects ? list(await prisma.requirement.findMany({ where: inProjects, select: { id: true, title: true }, take: MAX_OPTIONS })) : "";
    case "client":
      return list(await prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: MAX_OPTIONS }));
    case "testTemplate":
      return list(await prisma.testTemplate.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: MAX_OPTIONS }));
    default:
      return "";
  }
}

/** Una línea por acción con referencias que no existen; vacío si el plan está bien. */
export async function findMissingReferences(uses: Use[], userId: string): Promise<Map<string, string>> {
  const refsByUse = uses.map((u) => ({ use: u, refs: refsOf(u.name, u.input) }));
  const byKind = new Map<Kind, Set<string>>();
  for (const { refs } of refsByUse) for (const r of refs) (byKind.get(r.kind) ?? byKind.set(r.kind, new Set()).get(r.kind)!).add(r.id);
  const found = new Map<Kind, Set<string>>();
  await Promise.all([...byKind].map(async ([kind, ids]) => found.set(kind, await existing(kind, [...ids]))));

  const missing = refsByUse.map(({ use, refs }) => ({ use, bad: refs.filter((r) => !found.get(r.kind)!.has(r.id)) })).filter((x) => x.bad.length);
  const problems = new Map<string, string>();
  if (!missing.length) return problems;

  // Proyectos del plan: los nombrados y los de sus tareas válidas, para acotar las opciones.
  const validTasks = [...(found.get("task") ?? [])];
  const taskProjects = validTasks.length ? await prisma.task.findMany({ where: { id: { in: validTasks } }, select: { projectId: true } }) : [];
  const projectIds = [...new Set([...(found.get("project") ?? []), ...taskProjects.map((t) => t.projectId)])];

  const optionsCache = new Map<Kind, Promise<string>>();
  for (const { use, bad } of missing) {
    const lines = await Promise.all(
      bad.map(async (r) => {
        if (!optionsCache.has(r.kind)) optionsCache.set(r.kind, alternatives(r.kind, projectIds, userId));
        const options = await optionsCache.get(r.kind)!;
        return `No existe ${LABEL[r.kind]} con id «${r.id}» (o ya no está activa). ${options ? `Opciones válidas: ${options}.` : "Buscala de nuevo con las herramientas de consulta."}`;
      })
    );
    problems.set(use.id, lines.join(" "));
  }
  return problems;
}

export const MISSING_REFERENCE_INSTRUCTION =
  "Este plan NO se mostró a la persona porque nombra cosas que no existen. No lo vuelvas a proponer igual: contale en lenguaje simple qué no se encontró (por su nombre, no por id) y ofrecele 2 o 3 alternativas concretas de las opciones válidas para que elija. Las demás acciones del plan estaban bien; cuando elija, proponé el plan completo otra vez con la corrección.";
export const PLAN_HELD_TEXT = "No se ejecutó: el plan se frenó porque otra acción del mismo plan nombra algo que no existe. Volvé a proponerla junto con la corrección.";
