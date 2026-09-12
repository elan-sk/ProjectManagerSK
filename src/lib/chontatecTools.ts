import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { normalizeSearchText, matchesTaskSearch } from "@/lib/search";
import { getProjectDelaySummary, getTaskAlert, getBottlenecks, getTeamWorkload } from "@/lib/delays";
import { getProjectTaskSlack } from "@/lib/criticalPath";
import { TASK_STATUS_LABEL, PROJECT_PHASE_LABEL, projectPhase } from "@/lib/statusColors";
import { updateTaskStatus, addTask } from "@/app/(app)/projects/[id]/actions";
import {
  toggleStep,
  setTaskAssignees,
  updateTaskTitle,
  updateTaskDescription,
  updateTaskPhase,
  updateTaskType,
  setDependency,
  removeDependency,
  removeAttachment,
  deleteTask,
} from "@/app/(app)/projects/[id]/tasks/[taskId]/actions";
import type { TaskStatus } from "@prisma/client";

const NO_ACCESS = { error: "No tenés acceso a ese proyecto." };

// Tools de LECTURA — todas delegan en código de dominio existente
// (src/lib/delays.ts, src/lib/criticalPath.ts, src/lib/search.ts) o en
// queries directas de solo lectura, y todas quedan acotadas a los
// proyectos donde el usuario participa (ver getAccessibleProjectIds) — a
// diferencia de la UI de la app hoy (que no filtra lectura por rol), acá sí
// se restringe explícitamente: el chat no muestra info de un proyecto
// donde la persona no es PM, asignada ni revisora de ninguna tarea.
export const READ_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_projects",
    description: "Lista los proyectos a los que el usuario tiene acceso (id, nombre, cliente, estado). Usala primero para resolver el id de un proyecto que el usuario mencionó por nombre.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_my_tasks",
    description: "Lista las tareas del usuario que está preguntando. Si es admin, todas las tareas; si es PM de algún proyecto, las de sus proyectos; si es miembro, las que tiene asignadas.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string", description: "Filtrar por estado (opcional): NOT_STARTED, IN_PROGRESS, BLOCKED, COMPLETED, RETURNED" } },
    },
  },
  {
    name: "list_project_tasks",
    description: "Lista TODAS las tareas de un proyecto (no solo las del usuario) con sus fechas planeadas, estado y asignados — usala para responder cosas como \"¿cuál es la próxima tarea por vencer?\" dejando que vos mismo compares las fechas.",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        status: { type: "string", description: "Filtrar por estado (opcional)." },
      },
      required: ["projectId"],
    },
  },
  {
    name: "get_project_status",
    description: "Trae el estado general de un proyecto: fases, PM, y resumen de atrasos/avance.",
    input_schema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "get_task_details",
    description: "Trae el detalle de una tarea puntual: título, estado, asignados, checklist, adjuntos (solo nombre/tipo, no contenido), y su alerta de atraso.",
    input_schema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
  {
    name: "get_bottlenecks",
    description: "Cuellos de botella de un proyecto (tareas que más están frenando el cronograma).",
    input_schema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "get_schedule_analysis",
    description:
      'Holgura (CPM) de cada tarea de un proyecto: "slackDays" es cuántos días hábiles se puede atrasar esa tarea sin correr la fecha final del proyecto (0 = tarea crítica, "isCritical"=true, sin margen). Usala para responder qué tareas se pueden hacer en paralelo o adelantar para ganar tiempo: tareas con slackDays alto, o sin relación de dependencia entre sí y con fechas superpuestas, son buenas candidatas.',
    input_schema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "get_team_workload",
    description: "Carga de trabajo del equipo (cuántas tareas activas tiene cada persona), opcionalmente de un proyecto puntual. Sin projectId, es de todos los proyectos a los que el usuario tiene acceso.",
    input_schema: {
      type: "object",
      properties: { projectId: { type: "string", description: "Opcional — si no se pasa, es de todos los proyectos accesibles." } },
    },
  },
  {
    name: "search_tasks",
    description:
      "Busca tareas por texto en el título, la descripción o el nombre de los archivos adjuntos (mismo buscador tolerante a mayúsculas/tildes que usa el resto de la app) — sirve tanto para encontrar una tarea como para encontrar en qué tarea está un archivo. Opcionalmente dentro de un proyecto puntual; sin projectId busca en todos los proyectos accesibles.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        projectId: { type: "string", description: "Opcional." },
      },
      required: ["query"],
    },
  },
];

// Tools de ESCRITURA — acotadas a bajo riesgo, TODAS llaman a server
// actions ya existentes y ya gateadas por permissions.ts. Nunca se
// ejecutan directo: el loop en chontatec.ts las pausa para que el usuario
// confirme explícitamente antes de correr runWriteTool.
export const WRITE_TOOLS: Anthropic.Tool[] = [
  {
    name: "update_task_status",
    description: "Cambia el estado de una tarea (ej. marcarla como Completada, En curso, Bloqueada).",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        status: { type: "string", description: "NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETED | RETURNED" },
      },
      required: ["taskId", "status"],
    },
  },
  {
    name: "toggle_checklist_step",
    description: "Marca o desmarca un paso del checklist de una tarea.",
    input_schema: {
      type: "object",
      properties: {
        stepId: { type: "string" },
        done: { type: "boolean" },
      },
      required: ["stepId", "done"],
    },
  },
  {
    name: "reassign_task",
    description: "Agrega o quita una persona de los asignados de una tarea.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        addUserId: { type: "string", description: "Opcional — id del usuario a agregar." },
        removeUserId: { type: "string", description: "Opcional — id del usuario a quitar." },
      },
      required: ["taskId"],
    },
  },
];

// Tools de ESCRITURA AVANZADAS — solo se ofrecen si el usuario es admin o PM
// de al menos un proyecto (ver getToolsForUser). Igual que las básicas,
// llaman a server actions ya existentes: cada una vuelve a chequear
// requireProjectAdmin/permiso puntual en el momento de ejecutar (algunas
// tiran Error en vez de devolver {ok,error} — runWriteTool las envuelve en
// try/catch). delete_task y remove_attachment son IRREVERSIBLES — ver
// DESTRUCTIVE_TOOL_NAMES, la UI las marca con una advertencia más fuerte.
export const ADVANCED_WRITE_TOOLS: Anthropic.Tool[] = [
  {
    name: "create_task",
    description: "Crea una tarea nueva en un proyecto. Requiere al menos un asignado (assigneeIds).",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        phaseId: { type: "string" },
        title: { type: "string" },
        type: { type: "string", description: "SIMPLE | MILESTONE | QA | ADJUSTMENT" },
        description: { type: "string", description: "Opcional." },
        plannedStart: { type: "string", description: "Fecha de inicio, formato YYYY-MM-DD." },
        durationDays: { type: "number", description: "Duración en días hábiles, mínimo 1." },
        assigneeIds: { type: "array", items: { type: "string" }, description: "Al menos un id de usuario." },
      },
      required: ["projectId", "phaseId", "title", "type", "plannedStart", "durationDays", "assigneeIds"],
    },
  },
  {
    name: "update_task",
    description: "Actualiza título, descripción, fase y/o tipo de una tarea — cualquier combinación de campos, solo se cambian los que se manden.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        title: { type: "string", description: "Opcional." },
        description: { type: "string", description: "Opcional." },
        phaseId: { type: "string", description: "Opcional." },
        type: { type: "string", description: "Opcional. SIMPLE | MILESTONE | QA | ADJUSTMENT" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "set_task_dependency",
    description: "Vincula una tarea (sucesora) a una predecesora — recalcula fechas en cascada del resto del cronograma.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "La tarea sucesora (la que depende de la otra)." },
        predecessorId: { type: "string" },
        type: { type: "string", description: "Opcional: FINISH_TO_START (default, la normal) o START_TO_START (en paralelo)." },
      },
      required: ["taskId", "predecessorId"],
    },
  },
  {
    name: "remove_task_dependency",
    description: "Quita el vínculo de dependencia entre dos tareas.",
    input_schema: {
      type: "object",
      properties: { dependencyId: { type: "string" }, taskId: { type: "string" } },
      required: ["dependencyId", "taskId"],
    },
  },
  {
    name: "delete_task",
    description: "Elimina una tarea por completo — IRREVERSIBLE, se pierde también su checklist, adjuntos y dependencias.",
    input_schema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
  {
    name: "remove_attachment",
    description: "Elimina un adjunto (insumo o evidencia) de una tarea — IRREVERSIBLE.",
    input_schema: {
      type: "object",
      properties: { attachmentId: { type: "string" } },
      required: ["attachmentId"],
    },
  },
];

export const ALL_TOOLS: Anthropic.Tool[] = [...READ_TOOLS, ...WRITE_TOOLS, ...ADVANCED_WRITE_TOOLS];
export const WRITE_TOOL_NAMES = new Set([...WRITE_TOOLS, ...ADVANCED_WRITE_TOOLS].map((t) => t.name));
export const DESTRUCTIVE_TOOL_NAMES = new Set(["delete_task", "remove_attachment"]);

// Tools ofrecidas a ESTE usuario en esta conversación: las básicas siempre,
// las avanzadas solo si es admin o PM de al menos un proyecto — así un
// miembro normal ni siquiera ve la opción de crear/borrar/etc. (además del
// chequeo de permiso real que cada acción vuelve a hacer al ejecutar).
export async function getToolsForUser(userId: string): Promise<Anthropic.Tool[]> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const isAdmin = user.role === "ADMIN";
  const isPM = isAdmin || (await prisma.project.count({ where: { pmId: userId } })) > 0;
  return isPM ? ALL_TOOLS : [...READ_TOOLS, ...WRITE_TOOLS];
}

async function currentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("No autenticado.");
  return session.user.id;
}

// "Acceso" a un proyecto para Chontatec: PM de ese proyecto, o
// asignado/revisor de al menos una tarea ahí (admin = sin restricción,
// null). Es MÁS restrictivo que la UI de la app hoy (que no filtra lectura
// por rol) — decisión explícita del usuario: el chat no debe mostrar
// información de un proyecto donde la persona no participa en nada,
// aunque la propia página del proyecto no tenga ese filtro. El acceso es a
// nivel de PROYECTO completo (no por tarea individual dentro de él),
// espejando cómo ya funciona la pestaña "Archivos" del proyecto (le
// muestra todos los adjuntos del proyecto a cualquiera que la abra).
async function getAccessibleProjectIds(userId: string): Promise<string[] | null> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.role === "ADMIN") return null;

  const [pmProjects, assigned, reviewed] = await Promise.all([
    prisma.project.findMany({ where: { pmId: userId }, select: { id: true } }),
    prisma.taskAssignee.findMany({ where: { userId }, select: { task: { select: { projectId: true } } } }),
    prisma.taskReviewer.findMany({ where: { userId }, select: { task: { select: { projectId: true } } } }),
  ]);
  const ids = new Set<string>();
  pmProjects.forEach((p) => ids.add(p.id));
  assigned.forEach((a) => ids.add(a.task.projectId));
  reviewed.forEach((r) => ids.add(r.task.projectId));
  return Array.from(ids);
}

function hasAccess(accessibleIds: string[] | null, projectId: string) {
  return accessibleIds === null || accessibleIds.includes(projectId);
}

// Acceso a ARCHIVOS: más fino que el acceso a proyecto de arriba — el
// usuario ve los adjuntos de una tarea solo si es admin, PM del proyecto de
// esa tarea, o está asignado/es revisor de ESA tarea puntual (decisión
// explícita del usuario, más restrictivo que "cualquier tarea del
// proyecto"). No aplica a los links generales de la pestaña "Definición"
// (ProjectLink) — esos siguen siendo de acceso a nivel de proyecto,
// visibles para cualquier miembro con acceso al proyecto (ver
// get_project_status).
async function getFileAccessibleTaskIds(userId: string): Promise<Set<string> | null> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.role === "ADMIN") return null;

  const [pmProjects, assigned, reviewed] = await Promise.all([
    prisma.project.findMany({ where: { pmId: userId }, select: { tasks: { select: { id: true } } } }),
    prisma.taskAssignee.findMany({ where: { userId }, select: { taskId: true } }),
    prisma.taskReviewer.findMany({ where: { userId }, select: { taskId: true } }),
  ]);
  const ids = new Set<string>();
  pmProjects.forEach((p) => p.tasks.forEach((t) => ids.add(t.id)));
  assigned.forEach((a) => ids.add(a.taskId));
  reviewed.forEach((r) => ids.add(r.taskId));
  return ids;
}

function canSeeTaskFiles(fileAccessIds: Set<string> | null, taskId: string) {
  return fileAccessIds === null || fileAccessIds.has(taskId);
}

// El campo Project.status (PLANNING/ACTIVE/.../COMPLETED) es un valor
// crudo que ningún flujo de la app actualiza — queda pegado en PLANNING
// para siempre. La "fase" real se calcula acá con el mismo criterio que
// projects/page.tsx (src/lib/statusColors.ts), nunca se expone el campo
// crudo, que sería engañoso.
function computePhase(tasks: { status: string }[]) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const started = tasks.some((t) => t.status !== "NOT_STARTED");
  const phase = projectPhase(total, completed, started);
  return { phase, phaseLabel: PROJECT_PHASE_LABEL[phase] };
}

// Mismo filtro por rol que projects/page.tsx usa para el tablero por
// defecto — ADMIN todas, PM las de sus proyectos, MEMBER las asignadas.
async function myTasksWhere(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.role === "ADMIN") return {};
  const pmProjects = await prisma.project.findMany({ where: { pmId: userId }, select: { id: true } });
  if (pmProjects.length > 0) return { projectId: { in: pmProjects.map((p) => p.id) } };
  return { assignees: { some: { userId } } };
}

export async function runReadTool(name: string, input: unknown): Promise<string> {
  const userId = await currentUserId();

  switch (name) {
    case "list_projects": {
      const accessibleIds = await getAccessibleProjectIds(userId);
      const projects = await prisma.project.findMany({
        where: accessibleIds ? { id: { in: accessibleIds } } : undefined,
        select: { id: true, name: true, clientName: true, iconUrl: true, tasks: { select: { status: true } } },
        orderBy: { name: "asc" },
      });
      return JSON.stringify(
        projects.map((p) => ({ id: p.id, name: p.name, clientName: p.clientName, iconUrl: p.iconUrl, ...computePhase(p.tasks) }))
      );
    }

    case "list_my_tasks": {
      const { status } = z.object({ status: z.string().optional() }).parse(input);
      const where = await myTasksWhere(userId);
      const tasks = await prisma.task.findMany({
        where: { ...where, ...(status ? { status: status as TaskStatus } : {}) },
        select: { id: true, title: true, status: true, plannedEnd: true, projectId: true, project: { select: { name: true } } },
        orderBy: { plannedEnd: "asc" },
        take: 50,
      });
      return JSON.stringify(tasks.map((t) => ({ ...t, statusLabel: TASK_STATUS_LABEL[t.status] })));
    }

    case "list_project_tasks": {
      const { projectId, status } = z.object({ projectId: z.string(), status: z.string().optional() }).parse(input);
      const accessibleIds = await getAccessibleProjectIds(userId);
      if (!hasAccess(accessibleIds, projectId)) return JSON.stringify(NO_ACCESS);
      const tasks = await prisma.task.findMany({
        where: { projectId, ...(status ? { status: status as TaskStatus } : {}) },
        select: {
          id: true,
          title: true,
          status: true,
          plannedStart: true,
          plannedEnd: true,
          assignees: { include: { user: { select: { name: true, avatarUrl: true } } } },
        },
        orderBy: { plannedEnd: "asc" },
      });
      return JSON.stringify(
        tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          statusLabel: TASK_STATUS_LABEL[t.status],
          plannedStart: t.plannedStart,
          plannedEnd: t.plannedEnd,
          assignees: t.assignees.map((a) => ({ name: a.user.name, avatarUrl: a.user.avatarUrl })),
        }))
      );
    }

    case "get_project_status": {
      const { projectId } = z.object({ projectId: z.string() }).parse(input);
      const accessibleIds = await getAccessibleProjectIds(userId);
      if (!hasAccess(accessibleIds, projectId)) return JSON.stringify(NO_ACCESS);
      // Los links/archivos generales de "Definición" (ProjectLink) son de
      // acceso a nivel de proyecto — cualquiera con acceso al proyecto los
      // ve, a diferencia de los adjuntos de una tarea puntual (ver
      // getFileAccessibleTaskIds).
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          name: true,
          clientName: true,
          startDate: true,
          targetEndDate: true,
          iconUrl: true,
          pm: { select: { name: true, avatarUrl: true } },
          phases: { select: { name: true } },
          links: { select: { title: true, url: true } },
          tasks: { select: { status: true } },
        },
      });
      if (!project) return JSON.stringify({ error: "No existe ese proyecto." });
      const { tasks, ...projectRest } = project;
      const delaySummary = await getProjectDelaySummary(projectId);
      return JSON.stringify({ project: { ...projectRest, ...computePhase(tasks) }, delaySummary });
    }

    case "get_task_details": {
      const { taskId } = z.object({ taskId: z.string() }).parse(input);
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          project: { select: { id: true, name: true, countryCode: true, iconUrl: true } },
          assignees: { include: { user: { select: { name: true, avatarUrl: true } } } },
          steps: true,
          attachments: { select: { kind: true, fileName: true } },
        },
      });
      if (!task) return JSON.stringify({ error: "No existe esa tarea." });
      const accessibleIds = await getAccessibleProjectIds(userId);
      if (!hasAccess(accessibleIds, task.project.id)) return JSON.stringify(NO_ACCESS);
      const fileAccessIds = await getFileAccessibleTaskIds(userId);
      const filesAccessible = canSeeTaskFiles(fileAccessIds, task.id);
      const alert = await getTaskAlert(task.project.countryCode, task);
      return JSON.stringify({
        task: { ...task, statusLabel: TASK_STATUS_LABEL[task.status], attachments: filesAccessible ? task.attachments : [] },
        filesAccessible,
        alert,
      });
    }

    case "get_bottlenecks": {
      const { projectId } = z.object({ projectId: z.string() }).parse(input);
      const accessibleIds = await getAccessibleProjectIds(userId);
      if (!hasAccess(accessibleIds, projectId)) return JSON.stringify(NO_ACCESS);
      return JSON.stringify(await getBottlenecks(projectId));
    }

    case "get_schedule_analysis": {
      const { projectId } = z.object({ projectId: z.string() }).parse(input);
      const accessibleIds = await getAccessibleProjectIds(userId);
      if (!hasAccess(accessibleIds, projectId)) return JSON.stringify(NO_ACCESS);
      const [slackByTask, tasks] = await Promise.all([
        getProjectTaskSlack(projectId),
        prisma.task.findMany({ where: { projectId }, select: { id: true, title: true, status: true, plannedStart: true, plannedEnd: true } }),
      ]);
      return JSON.stringify(
        tasks.map((t) => {
          const slack = slackByTask.get(t.id);
          return {
            taskId: t.id,
            title: t.title,
            status: t.status,
            statusLabel: TASK_STATUS_LABEL[t.status],
            plannedStart: t.plannedStart,
            plannedEnd: t.plannedEnd,
            slackDays: slack?.slackDays ?? null,
            isCritical: slack?.isCritical ?? false,
          };
        })
      );
    }

    case "get_team_workload": {
      const { projectId } = z.object({ projectId: z.string().optional() }).parse(input);
      const accessibleIds = await getAccessibleProjectIds(userId);
      if (projectId) {
        if (!hasAccess(accessibleIds, projectId)) return JSON.stringify(NO_ACCESS);
        return JSON.stringify(await getTeamWorkload([projectId]));
      }
      return JSON.stringify(await getTeamWorkload(accessibleIds ?? undefined));
    }

    case "search_tasks": {
      const { query, projectId } = z.object({ query: z.string(), projectId: z.string().optional() }).parse(input);
      const accessibleIds = await getAccessibleProjectIds(userId);
      if (projectId && !hasAccess(accessibleIds, projectId)) return JSON.stringify(NO_ACCESS);
      const fileAccessIds = await getFileAccessibleTaskIds(userId);
      const tasks = await prisma.task.findMany({
        where: {
          ...(projectId ? { projectId } : accessibleIds ? { projectId: { in: accessibleIds } } : {}),
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          projectId: true,
          project: { select: { name: true } },
          attachments: { select: { fileName: true } },
        },
      });
      // Si no tiene acceso a los archivos de esa tarea puntual, la búsqueda
      // no debe encontrarla POR un nombre de archivo (ni mostrar cuál
      // matcheó) — solo puede aparecer por título/descripción.
      const matches = tasks
        .filter((t) => matchesTaskSearch({ ...t, attachments: canSeeTaskFiles(fileAccessIds, t.id) ? t.attachments : [] }, query))
        .slice(0, 20);
      return JSON.stringify(
        matches.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          statusLabel: TASK_STATUS_LABEL[t.status],
          projectId: t.projectId,
          projectName: t.project.name,
          matchingFiles: canSeeTaskFiles(fileAccessIds, t.id)
            ? t.attachments.filter((a) => normalizeSearchText(a.fileName).includes(normalizeSearchText(query))).map((a) => a.fileName)
            : [],
        }))
      );
    }

    default:
      return JSON.stringify({ error: `Tool de lectura desconocida: ${name}` });
  }
}

export function summarizeWriteTool(name: string, input: unknown): string {
  switch (name) {
    case "update_task_status": {
      const { status } = input as { status?: string };
      return `Cambiar el estado de la tarea a "${status ?? "?"}"`;
    }
    case "toggle_checklist_step": {
      const { done } = input as { done?: boolean };
      return done ? "Marcar este paso del checklist como hecho" : "Desmarcar este paso del checklist";
    }
    case "reassign_task": {
      const { addUserId, removeUserId } = input as { addUserId?: string; removeUserId?: string };
      if (addUserId && removeUserId) return "Reasignar la tarea (agregar y quitar personas)";
      if (addUserId) return "Agregar una persona a la tarea";
      if (removeUserId) return "Quitar una persona de la tarea";
      return "Reasignar la tarea";
    }
    case "create_task": {
      const { title } = input as { title?: string };
      return `Crear la tarea "${title ?? "?"}"`;
    }
    case "update_task": {
      const { title, description, phaseId, type } = input as { title?: string; description?: string; phaseId?: string; type?: string };
      const fields = [title !== undefined && "título", description !== undefined && "descripción", phaseId !== undefined && "fase", type !== undefined && "tipo"].filter(Boolean);
      return `Actualizar ${fields.join(", ") || "la tarea"}`;
    }
    case "set_task_dependency":
      return "Vincular esta tarea a una predecesora (recalcula el cronograma)";
    case "remove_task_dependency":
      return "Quitar el vínculo de dependencia";
    case "delete_task":
      return "⚠️ Eliminar esta tarea por completo (no se puede deshacer)";
    case "remove_attachment":
      return "⚠️ Eliminar este archivo (no se puede deshacer)";
    default:
      return "Ejecutar una acción";
  }
}

// Ejecuta la mutación real — se llama SOLO desde confirmChontatecAction en
// chontatec.ts, nunca durante el loop de lectura. Cada acción real
// (updateTaskStatus/toggleStep/setTaskAssignees) vuelve a chequear permisos
// en el momento exacto de ejecutar (auth() + canEditTask/getProjectAdmin
// adentro de cada una) — si algo cambió mientras la confirmación estaba
// pendiente, se rechaza solo, sin código nuevo acá.
export async function runWriteTool(name: string, input: unknown): Promise<{ ok: boolean; message: string }> {
  switch (name) {
    case "update_task_status": {
      const { taskId, status } = z.object({ taskId: z.string(), status: z.string() }).parse(input);
      const result = await updateTaskStatus(taskId, status as TaskStatus);
      return { ok: result.ok, message: result.ok ? "Listo, se actualizó el estado de la tarea." : (result.error ?? "No se pudo actualizar.") };
    }

    case "toggle_checklist_step": {
      const { stepId, done } = z.object({ stepId: z.string(), done: z.boolean() }).parse(input);
      try {
        await toggleStep(stepId, done);
        return { ok: true, message: "Listo, se actualizó el paso del checklist." };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "reassign_task": {
      const { taskId, addUserId, removeUserId } = z
        .object({ taskId: z.string(), addUserId: z.string().optional(), removeUserId: z.string().optional() })
        .parse(input);
      const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignees: true } });
      if (!task) return { ok: false, message: "No existe esa tarea." };
      const currentIds = new Set(task.assignees.map((a) => a.userId));
      if (addUserId) currentIds.add(addUserId);
      if (removeUserId) currentIds.delete(removeUserId);
      const formData = new FormData();
      for (const id of currentIds) formData.append("assigneeIds", id);
      const result = await setTaskAssignees(taskId, formData);
      return { ok: result.ok, message: result.ok ? "Listo, se actualizaron los asignados." : (result.error ?? "No se pudo reasignar.") };
    }

    case "create_task": {
      try {
        const parsed = z
          .object({
            projectId: z.string(),
            phaseId: z.string(),
            title: z.string(),
            type: z.string(),
            description: z.string().optional(),
            plannedStart: z.string(),
            durationDays: z.number(),
            assigneeIds: z.array(z.string()).min(1),
          })
          .parse(input);
        const formData = new FormData();
        formData.set("phaseId", parsed.phaseId);
        formData.set("title", parsed.title);
        formData.set("type", parsed.type);
        if (parsed.description) formData.set("description", parsed.description);
        formData.set("plannedStart", parsed.plannedStart);
        formData.set("durationDays", String(parsed.durationDays));
        for (const id of parsed.assigneeIds) formData.append("assigneeIds", id);
        const result = await addTask(parsed.projectId, formData);
        return {
          ok: result.ok,
          message: result.ok
            ? `Listo, se creó la tarea (taskId: ${result.id}, projectId: ${parsed.projectId}).`
            : (result.error ?? "No se pudo crear la tarea."),
        };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "update_task": {
      try {
        const parsed = z
          .object({
            taskId: z.string(),
            title: z.string().optional(),
            description: z.string().optional(),
            phaseId: z.string().optional(),
            type: z.string().optional(),
          })
          .parse(input);
        const changed: string[] = [];

        if (parsed.title !== undefined) {
          const r = await updateTaskTitle(parsed.taskId, parsed.title);
          if (!r.ok) return { ok: false, message: r.error ?? "No se pudo actualizar el título." };
          changed.push("título");
        }
        if (parsed.description !== undefined) {
          const fd = new FormData();
          fd.set("description", parsed.description);
          const r = await updateTaskDescription(parsed.taskId, fd);
          if (!r.ok) return { ok: false, message: r.error ?? "No se pudo actualizar la descripción." };
          changed.push("descripción");
        }
        if (parsed.phaseId !== undefined) {
          const r = await updateTaskPhase(parsed.taskId, parsed.phaseId);
          if (!r.ok) return { ok: false, message: r.error ?? "No se pudo actualizar la fase." };
          changed.push("fase");
        }
        if (parsed.type !== undefined) {
          const r = await updateTaskType(parsed.taskId, parsed.type);
          if (!r.ok) return { ok: false, message: r.error ?? "No se pudo actualizar el tipo." };
          changed.push("tipo");
        }
        if (changed.length === 0) return { ok: false, message: "No se especificó qué cambiar." };
        return { ok: true, message: `Listo, se actualizó: ${changed.join(", ")}.` };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "set_task_dependency": {
      try {
        const parsed = z.object({ taskId: z.string(), predecessorId: z.string(), type: z.string().optional() }).parse(input);
        const fd = new FormData();
        fd.set("predecessorId", parsed.predecessorId);
        if (parsed.type) fd.set("type", parsed.type);
        await setDependency(parsed.taskId, fd);
        return { ok: true, message: "Listo, se vinculó la dependencia." };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "remove_task_dependency": {
      try {
        const parsed = z.object({ dependencyId: z.string(), taskId: z.string() }).parse(input);
        await removeDependency(parsed.dependencyId, parsed.taskId);
        return { ok: true, message: "Listo, se quitó la dependencia." };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "delete_task": {
      try {
        const parsed = z.object({ taskId: z.string() }).parse(input);
        const result = await deleteTask(parsed.taskId);
        return { ok: result.ok, message: result.ok ? "Listo, se eliminó la tarea." : (result.error ?? "No se pudo eliminar.") };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "remove_attachment": {
      try {
        const parsed = z.object({ attachmentId: z.string() }).parse(input);
        await removeAttachment(parsed.attachmentId);
        return { ok: true, message: "Listo, se eliminó el archivo." };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    default:
      return { ok: false, message: `Tool de escritura desconocida: ${name}` };
  }
}
