import { z } from "zod";
import { revalidatePath } from "next/cache";
import { mimeFromFileName } from "@/lib/uploadFile";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { normalizeSearchText, matchesTaskSearch } from "@/lib/search";
import { getProjectDelaySummary, getTaskAlert, getBottlenecks, getTeamWorkload } from "@/lib/delays";
import { getProjectTaskSlack } from "@/lib/criticalPath";
import { TASK_STATUS_LABEL, PROJECT_PHASE_LABEL, projectPhase } from "@/lib/statusColors";
import { updateTaskStatus, addTask, addPhase, moveTask, resizeTask, updateProjectStartDate, updateProjectTargetEndDate, archiveProject } from "@/app/(app)/projects/[id]/actions";
import { updateProjectDescription, updatePhase, deletePhase, addObjective, updateObjective, deleteObjective, addRequirement, updateRequirement, deleteRequirement } from "@/app/(app)/projects/[id]/definitionActions";
import { reorderPhases } from "@/app/(app)/projects/[id]/taskOps";
import { postInternalMessage } from "@/app/(app)/internalMessageActions";
import { setTaskReviewers } from "@/app/(app)/projects/[id]/tasks/[taskId]/reviewActions";
import { requireProjectAdmin, type Actor } from "@/lib/permissions";
import {
  addAdjustmentItems,
  addAdjustmentAttachments,
  addCheckEvidence,
  addRoundDeliverables,
  addTaskAttachments,
  adjustmentItemSchema,
  checkSchema,
  createShare,
  deleteAdjustmentItem,
  designReviewTask,
  fileRefSchema,
  getShareLink,
  getTaskDesign,
  removeCheck,
  revokeShare,
  updateAdjustmentItem,
} from "@/lib/taskDesign";
import { commentInputSchema, listTaskThreads, postProjectComment, postTaskComment, PROJECT_SCOPES, setPollClosed, TASK_SCOPES, votePoll } from "@/lib/threadsApi";
import { reopenAdjustmentReview } from "@/app/(app)/projects/[id]/tasks/[taskId]/shareThreadActions";
import { mentionMarker } from "@/lib/commentBody";
import { addBusinessDays } from "@/lib/holidays";
import { getAppCountryCode } from "@/lib/appSettings";
import { sendDailyDigestNow } from "@/lib/notifications";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { prepareFileForBot } from "@/lib/botFilePrep";
import {
  addStep,
  addAttachmentRecord,
  addLinkAttachment,
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
import { sendDirectAlert, sendGroupAlert } from "@/lib/whatsapp";
import { getWhatsAppSettings } from "@/lib/appSettings";
import { notify } from "@/lib/notifications";

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
    name: "read_uploaded_file",
    description:
      "Lee AL INSTANTE el contenido de un archivo que la persona subió en este chat (aparece en su mensaje como «Archivos subidos en el chat: \"nombre\" → /uploads/…»). No hace falta adjuntarlo a ninguna tarea antes. Usala apenas la persona suba un archivo y pregunte por él (resumir, describir, extraer datos).",
    input_schema: {
      type: "object",
      properties: { fileUrl: { type: "string", description: "Ruta /uploads/… tal cual aparece en el mensaje." }, fileName: { type: "string" } },
      required: ["fileUrl", "fileName"],
    },
  },
  {
    name: "read_attachment",
    description:
      "Lee el CONTENIDO de un adjunto de una tarea o del proyecto (no solo su nombre): texto/CSV, Excel (.xlsx), Word (.docx), PDF e imágenes (se convierten a texto o se comprimen antes de leerlos). PowerPoint no se puede leer. Necesitás el attachmentId que devuelve get_task_details. Solo funciona si la persona tiene acceso a los archivos de esa tarea.",
    input_schema: {
      type: "object",
      properties: { attachmentId: { type: "string" } },
      required: ["attachmentId"],
    },
  },
  {
    name: "list_team_members",
    description: "Lista miembros activos (id, nombre, usuario y si tienen WhatsApp). Usala para identificar a quién enviar un WhatsApp o para recordar un usuario. Nunca muestra contraseñas.",
    input_schema: { type: "object", properties: {} },
  },
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
    description: "Trae el detalle de una tarea puntual: título, estado, asignados, revisores, checklist, adjuntos (id, nombre y tipo — para leer el contenido usá read_attachment) y su alerta de atraso.",
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
  {
    name: "get_task_design",
    description:
      "Devuelve la estructura completa de una tarea de tipo Ajuste, Prueba (QA) o Aceptación: los cambios pedidos con su «antes/después» y la calificación del cliente, o las rondas con sus pruebas/características, resultados, evidencias y quién calificó. Incluye los ids que necesitan las demás herramientas (itemId, roundId, checkId). Usala antes de editar o comentar un ítem concreto.",
    input_schema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
  },
  {
    name: "get_task_threads",
    description:
      "Devuelve TODOS los hilos de una tarea: comentarios generales (los que ve el cliente por su link), el hilo de cada cambio de un Ajuste, de cada característica de una Aceptación, de cada prueba y de cada ronda, y la conversación interna. Incluye las preguntas de selección con su estadística (cuántas personas eligieron cada opción y quién).",
    input_schema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
  },
];

// Tools de ESCRITURA — acotadas a bajo riesgo, TODAS llaman a server
// actions ya existentes y ya gateadas por permissions.ts. Nunca se
// ejecutan directo: el loop en chontatec.ts las pausa para que el usuario
// confirme explícitamente antes de correr runWriteTool.
export const WRITE_TOOLS: Anthropic.Tool[] = [
  {
    name: "add_task_comment",
    description:
      "Deja un comentario/nota (bitácora) interno en una tarea, o en el proyecto si no se indica taskId. Queda a nombre de la persona que conversa. Opcional: mentionUserIds para @mencionar personas del equipo.",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        taskId: { type: "string", description: "Opcional — si falta, el comentario es del proyecto." },
        body: { type: "string" },
        mentionUserIds: { type: "array", items: { type: "string" }, description: "Opcional — ids de usuarios a mencionar." },
      },
      required: ["projectId", "body"],
    },
  },
  {
    name: "add_checklist_steps",
    description:
      "Agrega uno o varios pasos al checklist de una tarea. Sirve para convertir en checklist una lista o puntos que salieron en la conversación: un paso por ítem.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        steps: { type: "array", items: { type: "string" }, description: "Un texto por paso, en orden." },
      },
      required: ["taskId", "steps"],
    },
  },
  {
    name: "attach_link_to_task",
    description: "Adjunta un enlace (URL) a una tarea como insumo o evidencia.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        url: { type: "string" },
        name: { type: "string", description: "Nombre visible del enlace." },
        kind: { type: "string", description: "INSUMO (por defecto) o RESULTADO (evidencia)." },
      },
      required: ["taskId", "url", "name"],
    },
  },
  {
    name: "attach_uploaded_file",
    description:
      "Adjunta a una tarea un archivo que la persona subió en este chat (el mensaje trae su ruta /uploads/… y su nombre). Es la forma de subir archivos desde el chat.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        fileUrl: { type: "string", description: "Ruta /uploads/… exactamente como aparece en el mensaje." },
        fileName: { type: "string" },
        kind: { type: "string", description: "INSUMO (por defecto) o RESULTADO (evidencia)." },
      },
      required: ["taskId", "fileUrl", "fileName"],
    },
  },
  {
    name: "send_whatsapp_message",
    description: "Envía un mensaje directo de WhatsApp a un usuario activo con teléfono registrado. Requiere confirmación del usuario antes de enviar.",
    input_schema: {
      type: "object",
      properties: { userId: { type: "string" }, message: { type: "string", description: "Texto del mensaje, sin contraseña ni secretos." } },
      required: ["userId", "message"],
    },
  },
  {
    name: "send_whatsapp_group_message",
    description:
      "Envía un mensaje al grupo de WhatsApp de un proyecto y menciona automáticamente al PM, asignados y revisores de la tarea indicada. Solo lo puede ejecutar un administrador o el PM de ese proyecto. Requiere confirmación antes de enviar.",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        taskId: { type: "string", description: "Tarea cuyos implicados deben ser mencionados." },
        message: { type: "string", description: "Texto del mensaje, sin contraseña ni secretos." },
      },
      required: ["projectId", "taskId", "message"],
    },
  },
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
  {
    name: "design_task",
    description:
      "Sube el DISEÑO de una tarea en un solo paso. Ajuste: `items` = cambios pedidos [{ description, note?, before?, after? }] (before/after son archivos o links). Prueba (QA) y Aceptación: crea la primera ronda si no existe (exige `deliverables`, al menos un archivo o link) y le carga `checks` = pruebas o características [{ title, criteria? (un punto por línea), category?, evidence? }]; en Prueba también admite `templateId`. Cada acción exige el rol correspondiente (asignado, revisor, PM o administrador); si no lo tiene, se rechaza.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        items: { type: "array", items: { type: "object", properties: { description: { type: "string" }, note: { type: "string" }, before: { type: "array", description: "Archivos o links: { url, name, mimeType? }. url = la ruta /uploads/… de un archivo subido en este chat, o un link https://.", items: { type: "object", properties: { url: { type: "string" }, name: { type: "string" }, mimeType: { type: "string" } }, required: ["url", "name"] } }, after: { type: "array", description: "Archivos o links: { url, name, mimeType? }. url = la ruta /uploads/… de un archivo subido en este chat, o un link https://.", items: { type: "object", properties: { url: { type: "string" }, name: { type: "string" }, mimeType: { type: "string" } }, required: ["url", "name"] } } }, required: ["description"] } },
        deliverables: { type: "array", description: "Archivos o links: { url, name, mimeType? }. url = la ruta /uploads/… de un archivo subido en este chat, o un link https://.", items: { type: "object", properties: { url: { type: "string" }, name: { type: "string" }, mimeType: { type: "string" } }, required: ["url", "name"] } },
        templateId: { type: "string" },
        checks: { type: "array", items: { type: "object", properties: { title: { type: "string" }, criteria: { type: "string" }, category: { type: "string" }, evidence: { type: "array", description: "Archivos o links: { url, name, mimeType? }. url = la ruta /uploads/… de un archivo subido en este chat, o un link https://.", items: { type: "object", properties: { url: { type: "string" }, name: { type: "string" }, mimeType: { type: "string" } }, required: ["url", "name"] } } }, required: ["title"] } },
      },
      required: ["taskId"],
    },
  },
  {
    name: "manage_design_item",
    description:
      "Edita un ítem ya diseñado. action: update_adjustment (itemId; description? note?), add_adjustment_files (itemId; kind BEFORE|AFTER; files), reopen_adjustment_review (itemId; deja que el cliente califique de nuevo ese cambio), add_check_evidence (checkId; files), add_round_files (roundId; files), delete (itemId = un cambio de Ajuste, o checkId = una prueba/característica sin resultado; es irreversible). Los ids salen de get_task_design.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", description: "update_adjustment | add_adjustment_files | reopen_adjustment_review | add_check_evidence | add_round_files | delete" },
        itemId: { type: "string" },
        checkId: { type: "string" },
        roundId: { type: "string" },
        description: { type: "string" },
        note: { type: "string" },
        kind: { type: "string", description: "BEFORE o AFTER" },
        files: { type: "array", description: "Archivos o links: { url, name, mimeType? }. url = la ruta /uploads/… de un archivo subido en este chat, o un link https://.", items: { type: "object", properties: { url: { type: "string" }, name: { type: "string" }, mimeType: { type: "string" } }, required: ["url", "name"] } },
      },
      required: ["action"],
    },
  },
  {
    name: "post_thread_comment",
    description:
      "Publica un comentario o una PREGUNTA de selección (única o múltiple) en un hilo, a nombre de la persona que conversa. scope de tarea (taskId): task = comentario general que ve el cliente por su link (admite archivos, que quedan como Insumos); adjustment_item = hilo de un cambio (targetId = itemId); acceptance_check = hilo de una característica (targetId = checkId); qa_check = hilo interno de una prueba (targetId = checkId; admite @menciones); round = hilo interno de una ronda (targetId = roundId); conversation = conversación interna de la tarea. scope de proyecto (projectId): project_conversation = conversación interna del proyecto; project_definition = hilo de la Definición que ve el cliente. Para mencionar, pasá mentionUserIds (ids de list_team_members).",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Para los scopes de tarea." },
        projectId: { type: "string", description: "Para los scopes de proyecto." },
        scope: { type: "string", description: "task | adjustment_item | acceptance_check | qa_check | round | conversation | project_conversation | project_definition" },
        targetId: { type: "string" },
        body: { type: "string", description: "El texto del comentario, o el enunciado de la pregunta." },
        parentId: { type: "string", description: "Opcional: id del comentario al que se responde." },
        mentionUserIds: { type: "array", items: { type: "string" } },
        attachments: { type: "array", description: "Archivos o links: { url, name, mimeType? }. url = la ruta /uploads/… de un archivo subido en este chat, o un link https://.", items: { type: "object", properties: { url: { type: "string" }, name: { type: "string" }, mimeType: { type: "string" } }, required: ["url", "name"] } },
        poll: { type: "object", description: "Si viene, el comentario es una PREGUNTA de selección y `body` es el enunciado.", properties: { multiple: { type: "boolean", description: "true = selección múltiple (casillas); false = selección única." }, options: { type: "array", items: { type: "string" }, description: "De 2 a 10 opciones." } }, required: ["options"] },
      },
      required: ["scope", "body"],
    },
  },
  {
    name: "answer_poll",
    description: "Responde una pregunta de selección con la persona que conversa (una sola opción si es de selección única). Reemplaza su respuesta anterior. El pollId sale de get_task_threads.",
    input_schema: { type: "object", properties: { pollId: { type: "string" }, optionIds: { type: "array", items: { type: "string" } } }, required: ["pollId", "optionIds"] },
  },
  {
    name: "close_poll",
    description: "Cierra (closed=true) o reabre (closed=false) una pregunta de selección. Puede quien la publicó, quien edita la tarea o el PM/administrador.",
    input_schema: { type: "object", properties: { pollId: { type: "string" }, closed: { type: "boolean" } }, required: ["pollId", "closed"] },
  },
  {
    name: "manage_share_link",
    description:
      "Consulta, crea o revoca el link público (sin cuenta) de una tarea o del proyecto, para que el cliente comente, responda preguntas, califique ajustes y acepte o devuelva características. action: get | create | revoke. Con taskId es el de la tarea; con projectId, el del proyecto (solo PM/administrador). Devuelve `path` (/share/<token>): al mostrarlo, anteponé la URL del sitio.",
    input_schema: {
      type: "object",
      properties: { action: { type: "string", description: "get | create | revoke" }, taskId: { type: "string" }, projectId: { type: "string" } },
      required: ["action"],
    },
  },
  {
    name: "add_task_files",
    description: "Sube varios archivos o links de una vez como Insumos (INSUMO) o Evidencias (RESULTADO) de una tarea. Para uno solo también sirven attach_uploaded_file y attach_link_to_task.",
    input_schema: {
      type: "object",
      properties: { taskId: { type: "string" }, kind: { type: "string", description: "INSUMO (por defecto) o RESULTADO" }, files: { type: "array", description: "Archivos o links: { url, name, mimeType? }. url = la ruta /uploads/… de un archivo subido en este chat, o un link https://.", items: { type: "object", properties: { url: { type: "string" }, name: { type: "string" }, mimeType: { type: "string" } }, required: ["url", "name"] } } },
      required: ["taskId", "files"],
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
    name: "create_project",
    description: "Crea un proyecto nuevo (con una fase inicial \"General\"). Si no se indica pmId, el PM es la persona que conversa.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        clientName: { type: "string", description: "Opcional." },
        startDate: { type: "string", description: "Fecha de inicio YYYY-MM-DD." },
        pmId: { type: "string", description: "Opcional — id del usuario que será PM." },
      },
      required: ["name", "startDate"],
    },
  },
  {
    name: "update_project",
    description:
      "Edita un proyecto: nombre, cliente, fecha de inicio, fecha de cierre (targetEndDate, vacío la quita), descripción del proyecto (description, el texto de la pestaña Definición; vacío la borra) o ícono (iconUrl = ruta /uploads/… de una imagen subida en el chat). Solo se cambia lo que se mande.",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        name: { type: "string" },
        clientName: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD." },
        targetEndDate: { type: "string", description: "YYYY-MM-DD, o vacío para quitarla." },
        description: { type: "string", description: "Descripción del proyecto en texto plano (reemplaza la actual)." },
        iconUrl: { type: "string" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "archive_project",
    description: "Archiva (elimina de la vista, sin borrar datos) un proyecto. Solo un administrador. Es lo mismo que el botón Eliminar proyecto de la app.",
    input_schema: { type: "object", properties: { projectId: { type: "string" } }, required: ["projectId"] },
  },
  {
    name: "manage_phase",
    description:
      "Gestiona fases de un proyecto: create (name), rename (phaseId, name), reorder (orderedPhaseIds con TODAS las fases en el orden nuevo) o delete (phaseId; solo si no tiene tareas).",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", description: "create | rename | reorder | delete" },
        projectId: { type: "string" },
        phaseId: { type: "string" },
        name: { type: "string" },
        orderedPhaseIds: { type: "array", items: { type: "string" } },
      },
      required: ["action", "projectId"],
    },
  },
  {
    name: "manage_objective",
    description: "Gestiona los objetivos de la pestaña Definición: add (projectId, title, description?), update (objectiveId, title, description?) o delete (objectiveId).",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", description: "add | update | delete" },
        projectId: { type: "string" },
        objectiveId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "manage_requirement",
    description:
      "Gestiona los requerimientos de Definición (alcance): add (projectId, title, description?, objectiveIds?), update (requirementId, title, description?, objectiveIds?) o delete (requirementId).",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", description: "add | update | delete" },
        projectId: { type: "string" },
        requirementId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        objectiveIds: { type: "array", items: { type: "string" } },
      },
      required: ["action"],
    },
  },
  {
    name: "update_task_schedule",
    description:
      "Cambia la fecha de inicio (plannedStart, solo si la tarea no ha iniciado) y/o la duración en días hábiles (durationDays) de una tarea. Recalcula en cascada las tareas que dependen de ella.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        plannedStart: { type: "string", description: "Nueva fecha de inicio YYYY-MM-DD." },
        durationDays: { type: "number", description: "Nueva duración en días hábiles, mínimo 2 (para 1 día usá una tarea de un día desde su creación)." },
      },
      required: ["taskId"],
    },
  },
  {
    name: "set_task_reviewers",
    description: "Agrega o quita revisores de una tarea de tipo Revisión.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        addUserId: { type: "string" },
        removeUserId: { type: "string" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "send_daily_digest",
    description:
      "Dispara ahora el resumen diario por WhatsApp: a TODO el equipo activo o a una persona (userId). Solo un administrador. Devuelve quién no lo recibió y por qué.",
    input_schema: { type: "object", properties: { userId: { type: "string", description: "Opcional — si falta, va a todos." } } },
  },
  {
    name: "create_task",
    description: "Crea una tarea nueva en un proyecto. Requiere al menos un asignado (assigneeIds). La fase se indica por phaseId (los ids de las fases vienen en get_project_status) o, más simple, por su nombre en phaseName; si el proyecto tiene una sola fase, se puede omitir.",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        phaseId: { type: "string", description: "Id de la fase (de get_project_status). Opcional si mandás phaseName." },
        phaseName: { type: "string", description: "Nombre de la fase, tal cual figura en el proyecto. Opcional si mandás phaseId." },
        title: { type: "string" },
        type: { type: "string", description: "SIMPLE | MILESTONE | QA | ADJUSTMENT | ACCEPTANCE" },
        description: { type: "string", description: "Opcional." },
        plannedStart: { type: "string", description: "Fecha de inicio, formato YYYY-MM-DD." },
        durationDays: { type: "number", description: "Duración en días hábiles, mínimo 1." },
        assigneeIds: { type: "array", items: { type: "string" }, description: "Al menos un id de usuario." },
      },
      required: ["projectId", "title", "type", "plannedStart", "durationDays", "assigneeIds"],
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
        type: { type: "string", description: "Opcional. SIMPLE | MILESTONE | QA | ADJUSTMENT | ACCEPTANCE" },
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
export const DESTRUCTIVE_TOOL_NAMES = new Set(["delete_task", "remove_attachment", "archive_project"]);
// Las herramientas "manage_*" con action=delete también son irreversibles.
export function isDestructiveTool(name: string, input: unknown) {
  if (DESTRUCTIVE_TOOL_NAMES.has(name)) return true;
  const action = (input as { action?: string } | null)?.action;
  if (name === "manage_share_link" && action === "revoke") return true;
  return name.startsWith("manage_") && action === "delete";
}
const ADMIN_ONLY_TOOLS = new Set(["archive_project", "send_daily_digest"]);
const ADVANCED_TOOL_NAMES = new Set(ADVANCED_WRITE_TOOLS.map((t) => t.name));

// Doble candado: aunque una acción quede pendiente y el rol cambie (o llegue
// una acción que el modelo no debería tener), se vuelve a validar el rol de
// quien CONFIRMA justo antes de ejecutar.
async function assertToolAllowed(userId: string, name: string) {
  if (!ADVANCED_TOOL_NAMES.has(name)) return;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
  const isAdmin = user.role === "ADMIN";
  const isPM = isAdmin || (await prisma.project.count({ where: { pmId: userId } })) > 0;
  if (!isPM) throw new Error("Esa acción es solo para administradores o PM.");
  if (ADMIN_ONLY_TOOLS.has(name) && !isAdmin) throw new Error("Esa acción es solo para administradores.");
}

// Los ids técnicos viajan al modelo en un comentario oculto (para armar el
// link) pero nunca se muestran a la persona: el chat los quita al dibujar.
const withHiddenIds = (text: string, ids: Record<string, string>) =>
  `${text}<!--ids:${Object.entries(ids).map(([k, v]) => `${k}=${v}`).join(",")}-->`;
const MEMBER_WRITE_TOOLS = WRITE_TOOLS.filter(
  (tool) => tool.name !== "send_whatsapp_message" && tool.name !== "send_whatsapp_group_message"
);

// Solo admins y PM pueden proponer mensajes individuales de WhatsApp. Para
// miembros, la única comunicación individual automática es el resumen diario;
// por eso ni siquiera reciben esta tool en el chat.
export async function getToolsForUser(userId: string): Promise<Anthropic.Tool[]> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const isAdmin = user.role === "ADMIN";
  const isPM = isAdmin || (await prisma.project.count({ where: { pmId: userId } })) > 0;
  return isPM ? ALL_TOOLS : [...READ_TOOLS, ...MEMBER_WRITE_TOOLS];
}

// Quien conversa, con su rol real: los servicios de diseño y de hilos aplican el mismo permiso que la app.
async function currentActor(): Promise<Actor> {
  const id = await currentUserId();
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true } });
  return { id, role: user.role };
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
  // Los proyectos ocultos por el admin no se ven desde el chat.
  const visible = await prisma.project.findMany({ where: { id: { in: [...ids] }, hidden: false }, select: { id: true } });
  return visible.map((p) => p.id);
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

type ToolResultContent = string | Anthropic.ToolResultBlockParam["content"];

const MAX_READ_BYTES = 5 * 1024 * 1024;

// Lee el contenido real de un archivo subido. Solo rutas /uploads/ con nombre
// simple (nunca una ruta arbitraria del servidor).
async function readAttachmentContent({ fileUrl, fileName, mimeType }: { fileUrl: string; fileName: string; mimeType: string }): Promise<ToolResultContent> {
  if (mimeType === LINK_MIME_TYPE) return JSON.stringify({ tipo: "enlace", nombre: fileName, url: fileUrl, nota: "Es un enlace externo; no se puede leer su contenido desde acá." });
  if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(fileUrl)) return JSON.stringify({ error: "Ruta de archivo inválida." });
  const filePath = path.join(process.cwd(), "public", fileUrl);
  const info = await stat(filePath).catch(() => null);
  if (!info) return JSON.stringify({ error: "El archivo ya no existe en el servidor." });
  if (info.size > MAX_READ_BYTES) return JSON.stringify({ error: "El archivo pesa más de 5 MB; no lo puedo leer completo." });
  // El archivo original queda intacto; solo lo que viaja al modelo se convierte/comprime.
  return prepareFileForBot(await readFile(filePath), fileName, mimeType);
}

export async function runReadTool(name: string, input: unknown): Promise<ToolResultContent> {
  const userId = await currentUserId();

  switch (name) {
    case "list_team_members": {
      const users = await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, username: true, phone: true },
        orderBy: { name: "asc" },
      });
      return JSON.stringify(users.map((user) => ({ id: user.id, name: user.name, username: user.username, hasWhatsApp: Boolean(user.phone) })));
    }
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
          phases: { select: { id: true, name: true, order: true }, orderBy: { order: "asc" } },
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
          attachments: { select: { id: true, kind: true, fileName: true, mimeType: true } },
          reviewers: { include: { user: { select: { id: true, name: true } } } },
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

    case "get_task_design":
    case "get_task_threads": {
      const { taskId } = z.object({ taskId: z.string() }).parse(input);
      const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
      if (!task) return JSON.stringify({ error: "No existe esa tarea." });
      const accessibleIds = await getAccessibleProjectIds(userId);
      if (!hasAccess(accessibleIds, task.projectId)) return JSON.stringify(NO_ACCESS);
      const actor: Actor = { id: userId, role: (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } })).role };
      return JSON.stringify(name === "get_task_design" ? await getTaskDesign(taskId, actor) : await listTaskThreads(taskId, actor));
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

    case "read_uploaded_file": {
      const { fileUrl, fileName } = z.object({ fileUrl: z.string().regex(/^\/uploads\/[A-Za-z0-9._-]+$/), fileName: z.string() }).parse(input);
      // Solo archivos que ESTA persona subió desde su chat (la ruta está en sus propios mensajes).
      const mine = await prisma.botMessage.findFirst({ where: { userId, role: "user", content: { contains: fileUrl } }, select: { id: true } });
      if (!mine) return JSON.stringify({ error: "Ese archivo no fue subido desde tu chat." });
      const { mimeFromFileName } = await import("@/lib/uploadFile");
      return readAttachmentContent({ fileUrl, fileName, mimeType: mimeFromFileName(fileName) });
    }
    case "read_attachment": {
      const { attachmentId } = z.object({ attachmentId: z.string() }).parse(input);
      const accessibleIds = await getAccessibleProjectIds(userId);
      const taskAttachment = await prisma.attachment.findUnique({ where: { id: attachmentId }, include: { task: { select: { id: true, projectId: true } } } });
      if (taskAttachment) {
        if (!hasAccess(accessibleIds, taskAttachment.task.projectId)) return JSON.stringify(NO_ACCESS);
        if (!canSeeTaskFiles(await getFileAccessibleTaskIds(userId), taskAttachment.task.id)) {
          return JSON.stringify({ error: "No tenés acceso a los archivos de esa tarea." });
        }
        return readAttachmentContent(taskAttachment);
      }
      const projectAttachment = await prisma.projectAttachment.findUnique({ where: { id: attachmentId } });
      if (!projectAttachment) return JSON.stringify({ error: "No existe ese adjunto." });
      if (!hasAccess(accessibleIds, projectAttachment.projectId)) return JSON.stringify(NO_ACCESS);
      return readAttachmentContent(projectAttachment);
    }

    default:
      return JSON.stringify({ error: `Tool de lectura desconocida: ${name}` });
  }
}

export function summarizeWriteTool(name: string, input: unknown): string {
  switch (name) {
    case "send_whatsapp_message":
      return "Enviar un mensaje directo por WhatsApp";
    case "send_whatsapp_group_message":
      return "Enviar un mensaje al grupo del proyecto y mencionar a los implicados";
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
    case "add_task_comment":
      return "Dejar un comentario en la tarea";
    case "add_checklist_steps": {
      const { steps } = input as { steps?: string[] };
      return `Agregar ${steps?.length ?? 0} paso(s) al checklist`;
    }
    case "attach_link_to_task":
      return "Adjuntar un enlace a la tarea";
    case "design_task": {
      const d = input as { items?: unknown[]; checks?: unknown[]; deliverables?: unknown[] };
      const n = (d.items?.length ?? 0) + (d.checks?.length ?? 0);
      return `Cargar el diseño de la tarea (${n} ítem${n === 1 ? "" : "s"}${d.deliverables?.length ? ` y ${d.deliverables.length} entregable(s)` : ""})`;
    }
    case "manage_design_item": {
      const { action } = input as { action?: string };
      return (
        {
          update_adjustment: "Editar un cambio del ajuste",
          add_adjustment_files: "Agregar archivos al antes/después de un cambio",
          reopen_adjustment_review: "Habilitar una nueva revisión del cliente en un cambio",
          add_check_evidence: "Agregar evidencia a una prueba o característica",
          add_round_files: "Agregar entregables a la ronda",
          delete: "⚠️ Eliminar un cambio, prueba o característica",
        }[action ?? ""] ?? "Editar el diseño de la tarea"
      );
    }
    case "post_thread_comment": {
      const { poll } = input as { poll?: unknown };
      return poll ? "Publicar una pregunta de selección" : "Publicar un comentario en el hilo";
    }
    case "answer_poll":
      return "Responder una pregunta";
    case "close_poll": {
      const { closed } = input as { closed?: boolean };
      return closed === false ? "Reabrir una pregunta" : "Cerrar una pregunta";
    }
    case "manage_share_link": {
      const { action } = input as { action?: string };
      return { get: "Consultar el link compartido", create: "Crear el link para compartir con el cliente", revoke: "⚠️ Dejar de compartir (el link deja de funcionar)" }[action ?? ""] ?? "Gestionar el link compartido";
    }
    case "add_task_files": {
      const { files } = input as { files?: unknown[] };
      return `Subir ${files?.length ?? 0} archivo(s) a la tarea`;
    }
    case "attach_uploaded_file":
      return "Adjuntar el archivo subido a la tarea";
    case "create_project": {
      const { name: projectName } = input as { name?: string };
      return `Crear el proyecto "${projectName ?? "?"}"`;
    }
    case "update_project":
      return "Editar el proyecto";
    case "archive_project":
      return "⚠️ Archivar (eliminar de la vista) este proyecto";
    case "manage_phase": {
      const { action } = input as { action?: string };
      return { create: "Crear una fase", rename: "Renombrar una fase", reorder: "Reordenar las fases", delete: "⚠️ Eliminar una fase" }[action ?? ""] ?? "Gestionar fases";
    }
    case "manage_objective": {
      const { action } = input as { action?: string };
      return { add: "Agregar un objetivo", update: "Editar un objetivo", delete: "⚠️ Eliminar un objetivo" }[action ?? ""] ?? "Gestionar objetivos";
    }
    case "manage_requirement": {
      const { action } = input as { action?: string };
      return { add: "Agregar un requerimiento", update: "Editar un requerimiento", delete: "⚠️ Eliminar un requerimiento" }[action ?? ""] ?? "Gestionar requerimientos";
    }
    case "update_task_schedule":
      return "Cambiar las fechas o la duración de la tarea";
    case "set_task_reviewers":
      return "Agregar o quitar un revisor";
    case "send_daily_digest":
      return "Enviar ahora el resumen diario por WhatsApp";
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
  try {
    await assertToolAllowed(await currentUserId(), name);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  switch (name) {
    case "send_whatsapp_message": {
      try {
        const { userId, message } = z.object({ userId: z.string(), message: z.string().trim().min(1).max(2000) }).parse(input);
        const senderId = await currentUserId();
        const [sender, managedProjects] = await Promise.all([
          prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { role: true } }),
          prisma.project.count({ where: { pmId: senderId } }),
        ]);
        if (sender.role !== "ADMIN" && managedProjects === 0) {
          return { ok: false, message: "Solo un administrador o PM puede enviar WhatsApp individuales desde el chat." };
        }
        const recipient = await prisma.user.findFirst({ where: { id: userId, active: true }, select: { phone: true, name: true } });
        if (!recipient?.phone) return { ok: false, message: "Esa persona no tiene un teléfono de WhatsApp registrado." };
        if (/contrase(?:ñ|n)a|password/i.test(message)) return { ok: false, message: "No se envían contraseñas por el bot. Usá el restablecimiento de contraseña." };
        const sent = await sendDirectAlert(recipient.phone, message);
        return { ok: sent, message: sent ? `Listo, se envió el WhatsApp a ${recipient.name}.` : "WhatsApp no está conectado; no se pudo enviar el mensaje." };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }
    case "send_whatsapp_group_message": {
      try {
        const { projectId, taskId, message } = z
          .object({ projectId: z.string(), taskId: z.string(), message: z.string().trim().min(1).max(2000) })
          .parse(input);
        if (/contrase(?:ñ|n)a|password/i.test(message)) {
          return { ok: false, message: "No se envían contraseñas por el bot. Usá el restablecimiento de contraseña." };
        }

        const senderId = await currentUserId();
        const [sender, project, task, whatsapp] = await Promise.all([
          prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { role: true } }),
          prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, pmId: true, whatsappGroupJid: true, hidden: true } }),
          prisma.task.findFirst({
            where: { id: taskId, projectId },
            select: { title: true, assignees: { select: { userId: true } }, reviewers: { select: { userId: true } } },
          }),
          getWhatsAppSettings(),
        ]);
        if (!project) return { ok: false, message: "No existe ese proyecto." };
        if (sender.role !== "ADMIN" && project.pmId !== senderId) {
          return { ok: false, message: "Solo el PM de este proyecto o un administrador pueden escribir en su grupo." };
        }
        if (!task) return { ok: false, message: "Esa tarea no pertenece al proyecto indicado." };
        if (project.hidden) return { ok: false, message: "Este proyecto está oculto y no envía mensajes a grupos de WhatsApp." };

        const groupJid = project.whatsappGroupJid ?? whatsapp.groupJid;
        if (!groupJid) return { ok: false, message: "Este proyecto no tiene un grupo de WhatsApp configurado." };
        const implicatedUserIds = Array.from(new Set([project.pmId, ...task.assignees.map((a) => a.userId), ...task.reviewers.map((r) => r.userId)]));
        const sent = await sendGroupAlert(groupJid, message, implicatedUserIds);
        return {
          ok: sent,
          message: sent
            ? `Listo, se envió el mensaje al grupo de ${project.name} y se mencionó a los implicados de “${task.title}”.`
            : "WhatsApp no está conectado; no se pudo enviar el mensaje al grupo.",
        };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }
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
            phaseId: z.string().optional(),
            phaseName: z.string().optional(),
            title: z.string(),
            type: z.string(),
            description: z.string().optional(),
            plannedStart: z.string(),
            durationDays: z.number(),
            assigneeIds: z.array(z.string()).min(1),
          })
          .parse(input);
        // La fase se resuelve dentro del proyecto: por id, por nombre, o la única que exista.
        const phases = await prisma.phase.findMany({ where: { projectId: parsed.projectId }, select: { id: true, name: true }, orderBy: { order: "asc" } });
        const wanted = parsed.phaseName ? normalizeSearchText(parsed.phaseName.trim()) : null;
        const phase =
          phases.find((ph) => ph.id === parsed.phaseId) ??
          (wanted ? phases.find((ph) => normalizeSearchText(ph.name) === wanted) ?? phases.find((ph) => normalizeSearchText(ph.name).includes(wanted)) : undefined) ??
          (!parsed.phaseId && !wanted && phases.length === 1 ? phases[0] : undefined);
        if (!phase) return { ok: false, message: `No encontré esa fase en el proyecto. Fases disponibles: ${phases.map((ph) => `"${ph.name}"`).join(", ") || "ninguna"}.` };
        const formData = new FormData();
        formData.set("phaseId", phase.id);
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
            ? withHiddenIds(`Listo, se creó la tarea "${parsed.title}".`, { taskId: String(result.id), projectId: parsed.projectId })
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

    case "add_task_comment": {
      try {
        const parsed = z
          .object({ projectId: z.string(), taskId: z.string().optional(), body: z.string().min(1), mentionUserIds: z.array(z.string()).optional() })
          .parse(input);
        const mentioned = parsed.mentionUserIds?.length
          ? await prisma.user.findMany({ where: { id: { in: parsed.mentionUserIds }, active: true }, select: { id: true, name: true } })
          : [];
        const body = [parsed.body.trim(), ...mentioned.map((u) => mentionMarker(u.id, u.name))].join(" ");
        const result = await postInternalMessage(parsed.projectId, parsed.taskId ?? null, body);
        return { ok: result.ok, message: result.ok ? "Listo, quedó el comentario." : (result.error ?? "No se pudo comentar.") };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "add_checklist_steps": {
      try {
        const { taskId, steps } = z.object({ taskId: z.string(), steps: z.array(z.string().trim().min(1).max(500)).min(1).max(50) }).parse(input);
        for (const description of steps) {
          const fd = new FormData();
          fd.set("description", description);
          await addStep(taskId, fd);
        }
        return { ok: true, message: `Listo, se agregaron ${steps.length} paso(s) al checklist.` };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "attach_link_to_task": {
      try {
        const { taskId, url, name: linkName, kind } = z.object({ taskId: z.string(), url: z.string(), name: z.string(), kind: z.enum(["INSUMO", "RESULTADO"]).optional() }).parse(input);
        await addLinkAttachment(taskId, kind ?? "INSUMO", url, linkName, await currentUserId());
        return { ok: true, message: "Listo, se adjuntó el enlace." };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "design_task": {
      try {
        const actor = await currentActor();
        const d = z
          .object({
            taskId: z.string(),
            items: z.array(adjustmentItemSchema).max(100).optional(),
            deliverables: z.array(fileRefSchema).max(20).optional(),
            templateId: z.string().optional(),
            checks: z.array(checkSchema).max(200).optional(),
          })
          .parse(input);
        const task = await prisma.task.findUnique({ where: { id: d.taskId }, select: { type: true } });
        if (!task) return { ok: false, message: "No existe esa tarea." };
        if (task.type === "ADJUSTMENT") {
          if (!d.items?.length) return { ok: false, message: "Para un Ajuste hace falta `items` (los cambios pedidos)." };
          const r = await addAdjustmentItems(d.taskId, actor, d.items);
          if (!r.ok) return { ok: false, message: r.error };
          return { ok: true, message: withHiddenIds(`Listo, se cargaron ${r.items.length} cambio(s) al ajuste.`, Object.fromEntries(r.items.map((it, i) => [`cambio${i + 1}`, it.id]))) };
        }
        const r = await designReviewTask(d.taskId, actor, { deliverables: d.deliverables, templateId: d.templateId, checks: d.checks });
        if (!r.ok) return { ok: false, message: r.error };
        return {
          ok: true,
          message: withHiddenIds(
            `Listo${r.createdRound ? ", se creó la ronda 1" : ""}: ${r.checks.length} ${task.type === "QA" ? "prueba(s)" : "característica(s)"} cargada(s)${r.templateAdded ? ` y ${r.templateAdded} de la plantilla` : ""}.`,
            { ronda: r.roundId, ...Object.fromEntries(r.checks.map((c, i) => [`item${i + 1}`, c.id])) }
          ),
        };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }
    case "manage_design_item": {
      try {
        const actor = await currentActor();
        const d = z
          .object({
            action: z.enum(["update_adjustment", "add_adjustment_files", "reopen_adjustment_review", "add_check_evidence", "add_round_files", "delete"]),
            itemId: z.string().optional(),
            checkId: z.string().optional(),
            roundId: z.string().optional(),
            description: z.string().trim().min(1).max(1000).optional(),
            note: z.string().max(2000).optional(),
            kind: z.enum(["BEFORE", "AFTER"]).optional(),
            files: z.array(fileRefSchema).max(20).optional(),
          })
          .parse(input);
        const need = (v: unknown, what: string) => {
          if (!v) throw new Error(`Falta ${what}.`);
          return v as string;
        };
        let r: { ok: boolean; error?: string };
        switch (d.action) {
          case "update_adjustment":
            r = await updateAdjustmentItem(need(d.itemId, "itemId"), actor, { description: d.description, note: d.note });
            break;
          case "add_adjustment_files":
            r = await addAdjustmentAttachments(need(d.itemId, "itemId"), actor, need(d.kind, "kind (BEFORE o AFTER)") as "BEFORE" | "AFTER", d.files ?? []);
            break;
          case "reopen_adjustment_review":
            r = await reopenAdjustmentReview(need(d.itemId, "itemId"), actor);
            break;
          case "add_check_evidence":
            r = await addCheckEvidence(need(d.checkId, "checkId"), actor, d.files ?? []);
            break;
          case "add_round_files":
            r = await addRoundDeliverables(need(d.roundId, "roundId"), actor, d.files ?? []);
            break;
          default:
            r = d.itemId ? await deleteAdjustmentItem(d.itemId, actor) : await removeCheck(need(d.checkId, "itemId o checkId"), actor);
        }
        return { ok: r.ok, message: r.ok ? "Listo, quedó hecho." : (r.error ?? "No se pudo completar la acción.") };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }
    case "post_thread_comment": {
      try {
        const actor = await currentActor();
        const d = z
          .object({
            taskId: z.string().optional(),
            projectId: z.string().optional(),
            scope: z.enum([...TASK_SCOPES, ...PROJECT_SCOPES]),
            targetId: z.string().optional(),
            mentionUserIds: z.array(z.string()).optional(),
          })
          .parse(input);
        const comment = commentInputSchema.parse({ ...(input as object), mentions: d.mentionUserIds });
        const isProjectScope = (PROJECT_SCOPES as readonly string[]).includes(d.scope);
        let r: { ok: boolean; error?: string };
        if (isProjectScope) {
          if (!d.projectId) return { ok: false, message: "Falta projectId para ese scope." };
          r = await postProjectComment(d.projectId, actor, d.scope as (typeof PROJECT_SCOPES)[number], comment);
        } else {
          if (!d.taskId) return { ok: false, message: "Falta taskId para ese scope." };
          r = await postTaskComment(d.taskId, actor, d.scope as (typeof TASK_SCOPES)[number], d.targetId, comment);
        }
        return { ok: r.ok, message: r.ok ? (comment.poll ? "Listo, quedó publicada la pregunta." : "Listo, quedó el comentario.") : (r.error ?? "No se pudo publicar.") };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }
    case "answer_poll": {
      try {
        const { pollId, optionIds } = z.object({ pollId: z.string(), optionIds: z.array(z.string()).min(1).max(10) }).parse(input);
        const r = await votePoll(pollId, optionIds, await currentActor());
        return { ok: r.ok, message: r.ok ? "Listo, quedó registrada la respuesta." : r.error };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }
    case "close_poll": {
      try {
        const { pollId, closed } = z.object({ pollId: z.string(), closed: z.boolean() }).parse(input);
        const r = await setPollClosed(pollId, closed, await currentActor());
        return { ok: r.ok, message: r.ok ? (closed ? "Listo, la pregunta quedó cerrada." : "Listo, la pregunta quedó abierta de nuevo.") : r.error };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }
    case "manage_share_link": {
      try {
        const actor = await currentActor();
        const d = z.object({ action: z.enum(["get", "create", "revoke"]), taskId: z.string().optional(), projectId: z.string().optional() }).parse(input);
        if (!d.taskId && !d.projectId) return { ok: false, message: "Falta taskId o projectId." };
        const target = d.taskId ? { taskId: d.taskId } : { projectId: d.projectId };
        if (d.action === "get") {
          const r = await getShareLink(target);
          return { ok: true, message: r.active ? `El link está activo: ${r.path}` : "No hay un link compartido activo." };
        }
        if (d.action === "create") {
          const r = await createShare(target, actor);
          return r.ok ? { ok: true, message: `Listo, el link es ${r.path} (anteponé la URL del sitio).` } : { ok: false, message: r.error };
        }
        const r = await revokeShare(target, actor);
        return { ok: r.ok, message: r.ok ? "Listo, el link dejó de funcionar." : r.error };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }
    case "add_task_files": {
      try {
        const { taskId, kind, files } = z
          .object({ taskId: z.string(), kind: z.enum(["INSUMO", "RESULTADO"]).optional(), files: z.array(fileRefSchema).min(1).max(20) })
          .parse(input);
        for (const f of files) {
          if (f.url.startsWith("/uploads/") && !(await stat(path.join(process.cwd(), "public", f.url)).catch(() => null))) {
            return { ok: false, message: `El archivo "${f.name}" no existe en el servidor.` };
          }
        }
        const r = await addTaskAttachments(taskId, await currentActor(), kind ?? "INSUMO", files);
        return { ok: r.ok, message: r.ok ? `Listo, se subieron ${files.length} archivo(s).` : r.error };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }
    case "attach_uploaded_file": {
      try {
        const { taskId, fileUrl, fileName, kind } = z
          .object({ taskId: z.string(), fileUrl: z.string().regex(/^\/uploads\/[A-Za-z0-9._-]+$/, "Ruta de archivo inválida."), fileName: z.string().min(1), kind: z.enum(["INSUMO", "RESULTADO"]).optional() })
          .parse(input);
        if (!(await stat(path.join(process.cwd(), "public", fileUrl)).catch(() => null))) return { ok: false, message: "Ese archivo no existe en el servidor." };
        await addAttachmentRecord(taskId, kind ?? "INSUMO", { url: fileUrl, name: fileName, mimeType: mimeFromFileName(fileName) }, await currentUserId());
        return { ok: true, message: "Listo, se adjuntó el archivo." };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "create_project": {
      try {
        const userId = await currentUserId();
        const parsed = z
          .object({ name: z.string().trim().min(1), clientName: z.string().optional(), startDate: z.coerce.date(), pmId: z.string().optional() })
          .parse(input);
        const pmId = parsed.pmId ?? userId;
        if (!(await prisma.user.findFirst({ where: { id: pmId, active: true }, select: { id: true } }))) return { ok: false, message: "Ese PM no existe o está inactivo." };
        const project = await prisma.project.create({
          data: {
            name: parsed.name,
            clientName: parsed.clientName || null,
            startDate: parsed.startDate,
            pmId,
            countryCode: await getAppCountryCode(),
            phases: { create: [{ name: "General", order: 0 }] },
          },
        });
        if (pmId !== userId) await notify([pmId], "ASSIGNED", `Te asignaron el proyecto "${project.name}"`, undefined, `/projects/${project.id}`);
        return { ok: true, message: withHiddenIds(`Listo, se creó el proyecto "${project.name}".`, { projectId: project.id }) };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "update_project": {
      try {
        const parsed = z
          .object({
            projectId: z.string(),
            name: z.string().trim().min(1).optional(),
            clientName: z.string().optional(),
            startDate: z.string().optional(),
            targetEndDate: z.string().optional(),
            description: z.string().optional(),
            iconUrl: z.string().regex(/^\/uploads\/[A-Za-z0-9._-]+$/, "Ícono inválido: tiene que ser una imagen subida.").optional(),
          })
          .parse(input);
        await requireProjectAdmin(parsed.projectId);
        const data: { name?: string; clientName?: string | null; iconUrl?: string } = {};
        const changed: string[] = [];
        if (parsed.name !== undefined) (data.name = parsed.name), changed.push("nombre");
        if (parsed.clientName !== undefined) (data.clientName = parsed.clientName.trim() || null), changed.push("cliente");
        if (parsed.iconUrl !== undefined) (data.iconUrl = parsed.iconUrl), changed.push("ícono");
        if (Object.keys(data).length > 0) await prisma.project.update({ where: { id: parsed.projectId }, data });
        if (parsed.startDate !== undefined) {
          const fd = new FormData();
          fd.set("startDate", parsed.startDate);
          const r = await updateProjectStartDate(parsed.projectId, fd);
          if (!r.ok) return { ok: false, message: r.error ?? "No se pudo cambiar la fecha de inicio." };
          changed.push("fecha de inicio");
        }
        if (parsed.targetEndDate !== undefined) {
          const fd = new FormData();
          fd.set("targetEndDate", parsed.targetEndDate);
          const r = await updateProjectTargetEndDate(parsed.projectId, fd);
          if (!r.ok) return { ok: false, message: r.error ?? "No se pudo cambiar la fecha de cierre." };
          changed.push("fecha de cierre");
        }
        if (parsed.description !== undefined) {
          // La descripción se guarda como HTML (editor de Definición): el texto plano pasa a párrafos escapados.
          const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const text = parsed.description.trim();
          const fd = new FormData();
          fd.set("description", text ? text.split(/\n{2,}/).map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`).join("") : "");
          const r = await updateProjectDescription(parsed.projectId, fd);
          if (!r.ok) return { ok: false, message: r.error ?? "No se pudo cambiar la descripción." };
          changed.push("descripción");
        }
        if (changed.length === 0) return { ok: false, message: "No se especificó qué cambiar." };
        revalidatePath(`/projects/${parsed.projectId}`);
        revalidatePath("/projects");
        return { ok: true, message: `Listo, se actualizó: ${changed.join(", ")}.` };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "archive_project": {
      try {
        const { projectId } = z.object({ projectId: z.string() }).parse(input);
        const r = await archiveProject(projectId);
        return { ok: r.ok, message: r.ok ? "Listo, el proyecto quedó archivado." : (r.error ?? "No se pudo archivar.") };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "manage_phase": {
      try {
        const parsed = z
          .object({ action: z.enum(["create", "rename", "reorder", "delete"]), projectId: z.string(), phaseId: z.string().optional(), name: z.string().optional(), orderedPhaseIds: z.array(z.string()).optional() })
          .parse(input);
        let r: { ok: boolean; error?: string };
        if (parsed.action === "create") {
          const fd = new FormData();
          fd.set("name", parsed.name ?? "");
          r = await addPhase(parsed.projectId, fd);
        } else if (parsed.action === "reorder") {
          r = await reorderPhases(parsed.projectId, parsed.orderedPhaseIds ?? []);
        } else {
          if (!parsed.phaseId) return { ok: false, message: "Falta indicar la fase." };
          if (parsed.action === "delete") r = await deletePhase(parsed.phaseId);
          else {
            // updatePhase reemplaza los requerimientos vinculados: se conservan los actuales.
            const phase = await prisma.phase.findUniqueOrThrow({ where: { id: parsed.phaseId }, select: { requirements: { select: { id: true } } } });
            const fd = new FormData();
            fd.set("name", parsed.name ?? "");
            for (const req of phase.requirements) fd.append("requirementIds", req.id);
            r = await updatePhase(parsed.phaseId, fd);
          }
        }
        const done = { create: "se creó la fase", rename: "se renombró la fase", reorder: "se reordenaron las fases", delete: "se eliminó la fase" }[parsed.action];
        return { ok: r.ok, message: r.ok ? `Listo, ${done}.` : (r.error ?? "No se pudo completar.") };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "manage_objective": {
      try {
        const parsed = z
          .object({ action: z.enum(["add", "update", "delete"]), projectId: z.string().optional(), objectiveId: z.string().optional(), title: z.string().optional(), description: z.string().optional() })
          .parse(input);
        const fd = new FormData();
        fd.set("title", parsed.title ?? "");
        if (parsed.description) fd.set("description", parsed.description);
        let r: { ok: boolean; error?: string };
        if (parsed.action === "add") r = parsed.projectId ? await addObjective(parsed.projectId, fd) : { ok: false, error: "Falta el proyecto." };
        else if (!parsed.objectiveId) r = { ok: false, error: "Falta indicar el objetivo." };
        else r = parsed.action === "update" ? await updateObjective(parsed.objectiveId, fd) : await deleteObjective(parsed.objectiveId);
        return { ok: r.ok, message: r.ok ? "Listo, quedó actualizado el objetivo." : (r.error ?? "No se pudo completar.") };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "manage_requirement": {
      try {
        const parsed = z
          .object({ action: z.enum(["add", "update", "delete"]), projectId: z.string().optional(), requirementId: z.string().optional(), title: z.string().optional(), description: z.string().optional(), objectiveIds: z.array(z.string()).optional() })
          .parse(input);
        let r: { ok: boolean; error?: string };
        if (parsed.action === "delete") {
          r = parsed.requirementId ? await deleteRequirement(parsed.requirementId) : { ok: false, error: "Falta indicar el requerimiento." };
        } else {
          const fd = new FormData();
          fd.set("title", parsed.title ?? "");
          if (parsed.description) fd.set("description", parsed.description);
          if (parsed.action === "add") {
            for (const id of parsed.objectiveIds ?? []) fd.append("objectiveIds", id);
            r = parsed.projectId ? await addRequirement(parsed.projectId, fd) : { ok: false, error: "Falta el proyecto." };
          } else if (!parsed.requirementId) {
            r = { ok: false, error: "Falta indicar el requerimiento." };
          } else {
            // Sin objectiveIds se conservan los vínculos actuales.
            const ids = parsed.objectiveIds ?? (await prisma.requirement.findUniqueOrThrow({ where: { id: parsed.requirementId }, select: { objectives: { select: { id: true } } } })).objectives.map((o) => o.id);
            for (const id of ids) fd.append("objectiveIds", id);
            r = await updateRequirement(parsed.requirementId, fd);
          }
        }
        return { ok: r.ok, message: r.ok ? "Listo, quedó actualizado el requerimiento." : (r.error ?? "No se pudo completar.") };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "update_task_schedule": {
      try {
        const parsed = z.object({ taskId: z.string(), plannedStart: z.string().optional(), durationDays: z.number().int().min(1).optional() }).parse(input);
        if (!parsed.plannedStart && !parsed.durationDays) return { ok: false, message: "No se especificó qué cambiar." };
        if (parsed.plannedStart) {
          const r = await moveTask(parsed.taskId, parsed.plannedStart);
          if (!r.ok) return { ok: false, message: r.error ?? "No se pudo mover la tarea." };
        }
        if (parsed.durationDays) {
          const task = await prisma.task.findUniqueOrThrow({ where: { id: parsed.taskId }, select: { plannedStart: true, project: { select: { countryCode: true } } } });
          const end = parsed.durationDays <= 1 ? task.plannedStart : await addBusinessDays(task.project.countryCode, task.plannedStart, parsed.durationDays - 1);
          const r = await resizeTask(parsed.taskId, "end", end.toISOString());
          if (!r.ok) return { ok: false, message: r.error ?? "No se pudo cambiar la duración." };
        }
        return { ok: true, message: "Listo, se actualizaron las fechas de la tarea." };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "set_task_reviewers": {
      try {
        const { taskId, addUserId, removeUserId } = z.object({ taskId: z.string(), addUserId: z.string().optional(), removeUserId: z.string().optional() }).parse(input);
        const task = await prisma.task.findUnique({ where: { id: taskId }, select: { reviewers: { select: { userId: true } } } });
        if (!task) return { ok: false, message: "No existe esa tarea." };
        const ids = new Set(task.reviewers.map((r) => r.userId));
        if (addUserId) ids.add(addUserId);
        if (removeUserId) ids.delete(removeUserId);
        const fd = new FormData();
        for (const id of ids) fd.append("reviewerIds", id);
        const r = await setTaskReviewers(taskId, fd);
        return { ok: r.ok, message: r.ok ? "Listo, se actualizaron los revisores." : (r.error ?? "No se pudo actualizar.") };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    case "send_daily_digest": {
      try {
        const { userId } = z.object({ userId: z.string().optional() }).parse(input);
        const result = await sendDailyDigestNow(userId);
        const failed = result.failures.length
          ? ` No llegó a: ${result.failures.map((f) => `${f.name} (${f.reason})`).join("; ")}.`
          : "";
        return { ok: result.sent > 0 || result.failures.length === 0, message: `Resumen enviado a ${result.sent} persona(s).${failed}` };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    }

    default:
      return { ok: false, message: `Tool de escritura desconocida: ${name}` };
  }
}
