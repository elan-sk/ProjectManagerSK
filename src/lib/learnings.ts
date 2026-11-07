import Anthropic from "@anthropic-ai/sdk";
import type { LearningStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBotConnection, checkAndConsumeBotQuestion } from "@/lib/botSettings";
import { createOpenAICompatMessage } from "@/lib/botOpenAI";
import { computeIndicators, indicatorsAsText } from "@/lib/companyIndicators";
import { getCompanyProfile } from "@/lib/companyProfile";
import { notify } from "@/lib/notifications";
import { appUrl } from "@/lib/appUrl";

export const LEARNING_TOPICS = ["Plazos", "Pruebas y calidad", "Ajustes y cambios", "Aceptación del cliente", "Equipo y carga", "Clientes", "Procesos"] as const;
export const LEARNING_STATUS_LABEL: Record<LearningStatus, string> = { PROPOSED: "Propuesta", APPLIED: "Aplicada", DISCARDED: "Descartada" };

type Viewer = { id: string; role: string };
type Result<T = object> = ({ ok: true } & T) | { ok: false; status: number; error: string };
const NO_ACCESS = { ok: false as const, status: 403, error: "No tiene acceso a estos aprendizajes." };

export function learningVisibleWhere(viewer: Viewer): Prisma.LearningWhereInput {
  const live = { OR: [{ projectId: null }, { project: { status: { not: "ARCHIVED" as const } } }] };
  if (viewer.role === "ADMIN") return live;
  return { AND: [live, { project: { pmId: viewer.id } }, { personId: null }] };
}

export async function canManageScope(viewer: Viewer, projectId: string | null): Promise<boolean> {
  if (viewer.role === "ADMIN") return true;
  if (!projectId) return false;
  return (await prisma.project.count({ where: { id: projectId, pmId: viewer.id } })) > 0;
}

export async function listLearnings(viewer: Viewer, filter: { projectId?: string | null; status?: LearningStatus; topic?: string } = {}) {
  return prisma.learning.findMany({
    where: {
      AND: [
        learningVisibleWhere(viewer),
        filter.projectId !== undefined ? { projectId: filter.projectId } : {},
        filter.status ? { status: filter.status } : {},
        filter.topic ? { topic: filter.topic } : {},
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { project: { select: { id: true, name: true } }, person: { select: { id: true, name: true } } },
  });
}

export type LearningInput = { topic: string; title: string; evidence: string; recommendation: string; personId?: string | null; cutoff?: string | null };

export function validateLearning(l: LearningInput): string | null {
  if (!LEARNING_TOPICS.includes(l.topic as (typeof LEARNING_TOPICS)[number])) return `Tema no válido: «${l.topic}».`;
  if (!l.title?.trim() || !l.recommendation?.trim()) return "Falta la conclusión o la recomendación.";
  if (!/\d/.test(l.evidence ?? "")) return "La evidencia tiene que citar cifras de los indicadores.";
  return null;
}

async function learningScope(id: string) {
  return prisma.learning.findUnique({ where: { id }, select: { projectId: true, personId: true } });
}

export async function createLearningsAs(viewer: Viewer, projectId: string | null, items: LearningInput[], source: "app" | "claude"): Promise<Result<{ count: number }>> {
  if (!(await canManageScope(viewer, projectId))) return NO_ACCESS;
  if (items.length === 0) return { ok: false, status: 400, error: "No llegó ningún aprendizaje." };
  for (const l of items) {
    const err = validateLearning(l);
    if (err) return { ok: false, status: 400, error: err };
    if (l.personId && viewer.role !== "ADMIN") return { ok: false, status: 403, error: "Los aprendizajes sobre una persona son solo para administradores." };
  }
  const personIds = items.map((l) => l.personId).filter(Boolean) as string[];
  if (personIds.length && (await prisma.user.count({ where: { id: { in: personIds } } })) !== new Set(personIds).size) return { ok: false, status: 400, error: "Alguna persona no existe." };
  await prisma.learning.createMany({
    data: items.map((l) => ({
      projectId,
      personId: l.personId || null,
      topic: l.topic,
      title: l.title.trim(),
      evidence: l.evidence.trim(),
      recommendation: l.recommendation.trim(),
      cutoff: l.cutoff ?? "A pedido",
      source,
      createdById: viewer.id,
    })),
  });
  return { ok: true, count: items.length };
}

export async function updateLearningAs(viewer: Viewer, id: string, patch: Partial<LearningInput> & { status?: LearningStatus }): Promise<Result> {
  const scope = await learningScope(id);
  if (!scope) return { ok: false, status: 404, error: "Ese aprendizaje ya no existe." };
  if (!(await canManageScope(viewer, scope.projectId)) || (scope.personId && viewer.role !== "ADMIN")) return NO_ACCESS;
  const textChange = patch.title !== undefined || patch.evidence !== undefined || patch.recommendation !== undefined || patch.topic !== undefined;
  if (textChange && viewer.role !== "ADMIN") return { ok: false, status: 403, error: "Solo un administrador puede editar el texto." };
  if (textChange) {
    const current = await prisma.learning.findUniqueOrThrow({ where: { id } });
    const err = validateLearning({ topic: patch.topic ?? current.topic, title: patch.title ?? current.title, evidence: patch.evidence ?? current.evidence, recommendation: patch.recommendation ?? current.recommendation });
    if (err) return { ok: false, status: 400, error: err };
  }
  await prisma.learning.update({
    where: { id },
    data: { status: patch.status, topic: patch.topic, title: patch.title?.trim(), evidence: patch.evidence?.trim(), recommendation: patch.recommendation?.trim() },
  });
  return { ok: true };
}

export async function deleteLearningAs(viewer: Viewer, id: string): Promise<Result> {
  if (viewer.role !== "ADMIN") return { ok: false, status: 403, error: "Solo un administrador puede eliminar aprendizajes." };
  if (!(await learningScope(id))) return { ok: false, status: 404, error: "Ese aprendizaje ya no existe." };
  await prisma.learning.delete({ where: { id } });
  return { ok: true };
}

const PROPOSE_TOOL: Anthropic.Tool = {
  name: "propose_learnings",
  description: "Entrega los aprendizajes (entre 3 y 7).",
  input_schema: {
    type: "object",
    properties: {
      learnings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            topic: { type: "string", enum: [...LEARNING_TOPICS] },
            title: { type: "string", description: "La conclusión en una frase." },
            evidence: { type: "string", description: "Las cifras de los indicadores que la sostienen, tal cual." },
            recommendation: { type: "string", description: "Qué hacer distinto, concreto." },
            personName: { type: "string", description: "Solo si la conclusión es sobre el desempeño de una persona: su nombre exacto como aparece en los indicadores." },
          },
          required: ["topic", "title", "evidence", "recommendation"],
        },
      },
      notEnoughData: { type: "boolean", description: "true si los indicadores no alcanzan para concluir nada con evidencia." },
    },
    required: ["learnings"],
  },
};

const NO_AI = "Falta conectar un servicio de IA en Configuración → Bot.";

type Conn = NonNullable<Awaited<ReturnType<typeof getBotConnection>>>;

async function askAi(conn: Conn, system: string, user: string, tools: Anthropic.Tool[]): Promise<{ ok: true; content: Anthropic.ContentBlock[] } | { ok: false; status: number; error: string }> {
  try {
    const deadline = Date.now() + 50_000;
    if (conn.format === "anthropic") {
      const client = new Anthropic({ apiKey: conn.apiKey, baseURL: conn.baseURL ?? undefined });
      const r = await client.messages.create(
        { model: conn.model, max_tokens: 8192, system, ...(tools.length ? { tools, tool_choice: { type: "auto" as const } } : {}), messages: [{ role: "user", content: user }] },
        { timeout: deadline - Date.now(), maxRetries: 1 }
      );
      return { ok: true, content: r.content };
    }
    const r = await createOpenAICompatMessage({ baseURL: conn.baseURL ?? "", apiKey: conn.apiKey, model: conn.model, maxTokens: 8192, system, tools, messages: [{ role: "user", content: user }], deadline });
    return { ok: true, content: r.content };
  } catch (err) {
    console.error("[aprendizajes] falló la IA", err);
    const status = (err as { status?: number }).status;
    const timedOut = /timeout|timed out|aborted/i.test(String((err as Error).message));
    return {
      ok: false,
      status: 502,
      error: timedOut
        ? "La IA tardó demasiado. Intentarlo con menos aprendizajes o de nuevo en un momento."
        : status === 402
          ? "El servicio de IA no tiene saldo."
          : "El servicio de IA no respondió. Intentarlo de nuevo en un momento.",
    };
  }
}

export async function generateLearnings(viewer: Viewer, scope: { projectId: string | null; from?: Date | null; cutoff: string }): Promise<Result<{ count: number }>> {
  if (!(await canManageScope(viewer, scope.projectId))) return NO_ACCESS;
  const conn = await getBotConnection();
  if (!conn) return { ok: false, status: 409, error: NO_AI };
  const quota = await checkAndConsumeBotQuestion();
  if (!quota.ok) return { ok: false, status: 409, error: "Se acabaron las preguntas del mes para la IA." };

  const [indicators, profile, existing, project] = await Promise.all([
    computeIndicators({ projectIds: scope.projectId ? [scope.projectId] : null, from: scope.from ?? null }),
    getCompanyProfile(),
    prisma.learning.findMany({ where: { projectId: scope.projectId }, select: { title: true, status: true } }),
    scope.projectId ? prisma.project.findUnique({ where: { id: scope.projectId }, select: { name: true, clientName: true } }) : null,
  ]);
  if (indicators.every((i) => i.rows.length === 0)) return { ok: false, status: 409, error: "Todavía no hay datos suficientes para sacar aprendizajes." };

  const intent = profile.topics.filter((t) => ["app_goals", "advice"].includes(t.key) && t.text).map((t) => t.text).join(" ");
  const system = `Sos un consultor de gestión de proyectos. Sacás aprendizajes de ${project ? `el proyecto «${project.name}»${project.clientName ? ` (cliente ${project.clientName})` : ""}` : "la empresa en el período"} SOLO con los indicadores de abajo, calculados por la app.
Reglas: entre 3 y 7 aprendizajes; cada evidencia cita cifras exactas de los indicadores; nunca inventes un dato; no repitas los ya existentes; tema de la lista; recomendación concreta y accionable; personName solo si la conclusión es sobre el desempeño de una persona. Orientá las conclusiones por lo que la empresa quiere lograr: ${intent || "(sin definir)"}. Si los datos no alcanzan, notEnoughData=true y lista vacía. Español neutro, tercera persona. Respondé SOLO con la herramienta propose_learnings.`;
  const user = `Indicadores:\n${indicatorsAsText(indicators)}\n\nAprendizajes ya existentes (no repetir):\n${existing.map((e) => `- ${e.title}`).join("\n") || "(ninguno)"}`;

  const ai = await askAi(conn, system, user, [PROPOSE_TOOL]);
  if (!ai.ok) return ai;
  const input = ai.content.find((b) => b.type === "tool_use")?.input;

  const parsed = input as { learnings?: { topic: string; title: string; evidence: string; recommendation: string; personName?: string }[]; notEnoughData?: boolean } | undefined;
  if (!parsed?.learnings?.length) return { ok: false, status: 409, error: parsed?.notEnoughData ? "Todavía no hay datos suficientes para sacar aprendizajes." : "La IA no devolvió aprendizajes. Intentarlo de nuevo." };
  const people = await prisma.user.findMany({ select: { id: true, name: true } });
  const items: LearningInput[] = parsed.learnings.slice(0, 7).map((l) => ({
    topic: l.topic,
    title: l.title,
    evidence: l.evidence,
    recommendation: l.recommendation,
    personId: l.personName ? (people.find((p) => p.name.trim().toLowerCase() === l.personName!.trim().toLowerCase())?.id ?? null) : null,
    cutoff: scope.cutoff,
  }));
  const valid = items.filter((l) => !validateLearning(l)).map((l) => (viewer.role === "ADMIN" ? l : { ...l, personId: null }));
  if (valid.length === 0) return { ok: false, status: 409, error: "La IA no devolvió aprendizajes con evidencia en cifras. Intentarlo de nuevo." };
  return createLearningsAs(viewer, scope.projectId, valid, "app");
}

export async function promptLearningsOnce(key: string, message: string, projectId: string | null) {
  try {
    await prisma.learningPrompt.create({ data: { key } });
  } catch {
    return false;
  }
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  const pm = projectId ? await prisma.project.findUnique({ where: { id: projectId }, select: { pmId: true } }) : null;
  const ids = [...new Set([...admins.map((a) => a.id), ...(pm ? [pm.pmId] : [])])];
  const url = `${appUrl() ?? ""}${projectId ? `/projects/${projectId}?view=definition#aprendizajes` : "/company#aprendizajes"}`;
  await notify(ids, "SYSTEM", message, undefined, url, projectId ? { projectId } : undefined);
  return true;
}

export async function promptIfPhaseComplete(taskId: string) {
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { phaseId: true, phase: { select: { name: true } }, project: { select: { id: true, name: true } } } });
    if (!task) return;
    const open = await prisma.task.count({ where: { phaseId: task.phaseId, status: { not: "COMPLETED" } } });
    if (open > 0) return;
    await promptLearningsOnce(`phase:${task.phaseId}`, `La fase «${task.phase.name}» de «${task.project.name}» quedó completa: está lista para sacar aprendizajes.`, task.project.id);
  } catch (err) {
    console.error("[aprendizajes] aviso de fase completa falló", err);
  }
}

export async function promptMonthlyLearnings(now = new Date()) {
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit" }).format(now);
  const day = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", day: "numeric" }).format(now));
  if (day !== 1) return false;
  return promptLearningsOnce(`month:${month}`, "Empezó un mes nuevo: se pueden sacar los aprendizajes de la empresa del mes anterior.", null);
}

export const EXPORT_FORMATS = { docx: "Word", pdf: "PDF", pptx: "PowerPoint", md: "Texto (.md)" } as const;
export type ExportFormat = keyof typeof EXPORT_FORMATS;

export async function exportLearnings(viewer: Viewer, ids: string[], format: ExportFormat): Promise<Result<{ url: string; name: string }>> {
  const rows = (await listLearnings(viewer)).filter((l) => ids.includes(l.id) && l.status !== "DISCARDED");
  if (rows.length === 0) return { ok: false, status: 400, error: "No hay aprendizajes para exportar (los descartados no se incluyen)." };
  const conn = await getBotConnection();
  if (!conn) return { ok: false, status: 409, error: NO_AI };
  const quota = await checkAndConsumeBotQuestion();
  if (!quota.ok) return { ok: false, status: 409, error: "Se acabaron las preguntas del mes para la IA." };

  const profile = await getCompanyProfile();
  const scope = [...new Set(rows.map((l) => l.project?.name ?? "Empresa"))].join(", ");
  const slides = format === "pptx";
  const system = `Sos un consultor de gestión. Escribís un plan de mejora para el equipo y la gerencia de ${profile.name ?? "la empresa"}, en Markdown, con SOLO los aprendizajes de abajo (no inventes datos ni cifras).
Estructura: «# Plan de mejora — ${scope}»; ${slides ? "una diapositiva por sección con «## Título» y como máximo 5 viñetas cortas" : "secciones con «##»"}: Resumen (2-3 líneas); Prioridades (tabla: Recomendación | Prioridad Alta/Media/Baja | Responsable sugerido por rol, nunca un nombre que no esté en los datos); una sección por aprendizaje con Qué pasó (la evidencia con sus cifras), Qué hacer (pasos concretos) y Cómo medirlo; Próximos pasos. Español neutro, tercera persona, sin jerga técnica. Respondé solo con el Markdown.`;
  const user = rows
    .map((l) => `- [${l.topic}] ${l.title}\n  Proyecto: ${l.project?.name ?? "Empresa"} · Estado: ${LEARNING_STATUS_LABEL[l.status]}\n  Evidencia: ${l.evidence}\n  Recomendación: ${l.recommendation}${l.person ? `\n  Persona: ${l.person.name}` : ""}`)
    .join("\n");
  const ai = await askAi(conn, system, user, []);
  if (!ai.ok) return ai;
  const markdown = ai.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .replace(/^```(?:markdown|md)?\s*|\s*```$/g, "")
    .trim();
  if (!markdown) return { ok: false, status: 502, error: "La IA no devolvió el documento. Intentarlo de nuevo." };

  const { buildFile } = await import("@/lib/botFileCreate");
  const { getDocTheme } = await import("@/lib/companyBrand");
  const { saveUploadedFile } = await import("@/lib/uploadFile");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const built = await buildFile(`Plan de mejora ${date}.${format}`, markdown, format === "md" ? null : await getDocTheme());
  if (!built.ok) return { ok: false, status: 400, error: built.error };
  const saved = await saveUploadedFile(new File([new Uint8Array(built.buffer)], built.name));
  if (!saved.ok) return { ok: false, status: 400, error: saved.error };
  return { ok: true, url: saved.url, name: built.name };
}

export async function appliedRulesText(viewer: Viewer): Promise<string> {
  const managed = viewer.role === "ADMIN" ? null : (await prisma.project.findMany({ where: { pmId: viewer.id }, select: { id: true } })).map((p) => p.id);
  const rows = await prisma.learning.findMany({
    where: {
      status: "APPLIED",
      personId: null,
      OR: [{ projectId: null }, { project: { status: { not: "ARCHIVED" }, ...(managed ? { id: { in: managed } } : {}) } }],
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: { number: true, topic: true, recommendation: true, projectId: true, project: { select: { name: true } } },
  });
  if (rows.length === 0) return "";
  const lines = rows.map((l) => `- #${l.number} [${l.topic}] (${l.project?.name ?? "Empresa"}): ${l.recommendation}`);
  return `Reglas de la empresa (aprendizajes APLICADOS: decisiones ya tomadas). Al proponer o crear proyectos, fases, tareas, tiempos o pruebas, aplicá las que correspondan y decí en una frase cuál aplicás con su número (ej. «Según el aprendizaje #4, dejo holgura en diseño»). No las apliques si no tienen que ver con lo que se está creando:\n${lines.join("\n")}`;
}
