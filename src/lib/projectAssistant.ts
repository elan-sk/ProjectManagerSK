import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getProjectAdmin, trustedActor, canCreateProjects } from "@/lib/permissions";
import { appUrl } from "@/lib/appUrl";
import type { ConversationMode, Me } from "@/lib/chontatec";
import type { ChatChannel } from "@/lib/actorContext";
import { ALL_TOOLS, isDestructiveTool, runReadTool, runWriteTool, summarizeWriteTool } from "@/lib/chontatecTools";
import { READ_WEB_PAGE_TOOL, runReadWebPage, webResearchRules } from "@/lib/assistantWebTools";
import { getCompanyProfile, profileViewFor, taskTypeContext } from "@/lib/companyProfile";
import { similarProjects } from "@/lib/similarProjects";
import { appliedRulesText } from "@/lib/learnings";
import { CLIENT_STEPS, PROJECT_STEPS, TASK_STEPS, clientCoverage, clientGaps, projectCoverage, stepMarksFromHistory, stepStates, taskCoverage, taskGaps, type StepDef, type TaskFacts } from "@/lib/projectAssistantSteps";

export const NEW_PROJECT_CHANNEL = "project:new";
export const NEW_CLIENT_CHANNEL = "client:new";
export const clientChannel = (clientId: string | null): ChatChannel => (clientId ? `client:${clientId}` : NEW_CLIENT_CHANNEL);
export const projectChannel = (projectId: string | null): ChatChannel => (projectId ? `project:${projectId}` : NEW_PROJECT_CHANNEL);

const PROJECT_READS = [
  "read_uploaded_file",
  "list_team_members",
  "get_team_workload",
  "get_working_calendar",
  "list_clients",
  "get_client",
  "list_tags",
  "list_test_templates",
  "get_project_definition",
  "list_project_tasks",
];
const PROJECT_WRITES = [
  "create_project",
  "update_project",
  "save_client",
  "set_project_role",
  "manage_objective",
  "manage_requirement",
  "manage_phase",
  "create_task",
  "set_task_dependency",
  "set_task_tag",
  "add_project_files",
];
const CLIENT_READS = ["read_uploaded_file", "list_clients", "get_client"];
const CLIENT_WRITES = ["save_client"];

const pick = (names: string[]) => names.map((n) => ALL_TOOLS.find((t) => t.name === n)).filter((t): t is Anthropic.Tool => Boolean(t));

function stepTool(steps: readonly StepDef[]): Anthropic.Tool {
  return {
    name: "assistant_step",
    description: "Actualiza la lista de pasos que ve la persona: focus = el paso que estás preguntando ahora (llamala cada vez que pasás a un paso); skip = la persona pidió saltarlo; done = quedó completo sin que haya nada que crear.",
    input_schema: {
      type: "object",
      properties: { step: { type: "string", enum: steps.map((s) => s.key) }, action: { type: "string", enum: ["focus", "skip", "done"] } },
      required: ["step", "action"],
    },
  };
}

const SIMILAR_TOOL: Anthropic.Tool = {
  name: "find_similar_projects",
  description: "Proyectos parecidos que la persona puede ver (del mismo cliente o del mismo tipo de trabajo, activos o archivados): sus fases, tareas, días hábiles que tomó cada fase, rondas de pruebas y sus aprendizajes (conclusión y recomendación). Usala antes de proponer fases, tiempos y pruebas, y tené en cuenta esos aprendizajes diciendo de qué proyecto salen.",
  input_schema: { type: "object", properties: { clientId: { type: "string" }, text: { type: "string", description: "Nombre y de qué trata el proyecto nuevo." } }, required: ["text"] },
};

const CLIENT_RULES = `Cliente (ficha reutilizable en todos sus proyectos):
- Buscalo primero con list_clients. Si existe, mostrá en pocas líneas su ficha (get_client) y preguntá si cambió algo.
- Si no existe, preguntá a qué se dedica, el contacto (persona, correo, teléfono), su sitio web o redes y qué espera o cómo es trabajar con él. Con eso redactá el «Perfil» (texto libre en tercera persona, sin inventar nada).
- La ficha se guarda con save_client y la persona la confirma con el botón, sin preguntar antes en texto. Un PM puede crear clientes pero no cambiar la ficha de uno existente: si hace falta cambiarla y no es administrador, decile que lo pida a un administrador.`;

function stepList(steps: readonly StepDef[]) {
  return steps.map((s, i) => `${i + 1}. ${s.label} (${s.key})`).join("\n");
}

function projectRules(botName: string, isNew: boolean, isAdmin: boolean, companyEmpty: boolean) {
  const appBase = appUrl() ?? "";
  return `Sos ${botName}, en modo asistente de proyectos de ProjectManagerSK. Guiás a un ${isAdmin ? "administrador" : "PM"} para armar un proyecto completo conversando, y lo creás por bloques con su confirmación.

Pasos, en este orden:
${stepList(PROJECT_STEPS)}

Bloques (cada uno se crea recién cuando la persona pulsa «Confirmar»):
1) Proyecto + Cliente + Tiempos → create_project con name, description (de qué trata, en texto plano), cliente (clientId o clientName), startDate, targetEndDate y pmId (por defecto quien conversa). Si el cliente es nuevo, proponé save_client en la MISMA respuesta, antes de create_project, y usá en create_project el mismo clientName.
2) Equipo → set_project_role por persona (qué hace en el proyecto).
3) Objetivos y Requerimientos → manage_objective (add) por objetivo y manage_requirement (add) por requerimiento con objectiveTitles, todo en la misma respuesta.
4) Fases y Tareas → manage_phase (create) por fase y create_task por tarea (phaseName, type, plannedStart, durationDays, assigneeIds, requirementTitles y tags si el proyecto usa etiquetas), y set_task_dependency con projectId, taskTitle y predecessorTitle; todo en la misma respuesta.
Autorización (UNA sola por bloque): cuando el bloque está listo, en la MISMA respuesta escribí un resumen corto y proponé TODAS sus escrituras; debajo aparece el recuadro con «Confirmar», que es la única autorización. Nunca preguntes en texto «¿lo creo?», «¿le doy?» ni esperes un «sí» o «adelante» antes de proponer: eso obliga a autorizar dos veces. El resumen no repite lo que ya muestra el recuadro: una línea por grupo. Si la persona cancela, preguntá qué cambiar y volvé a proponer el bloque corregido.

Reglas:
- Una pregunta por mensaje, corta y amable. Antes de cada pregunta, una frase con lo que entendiste (feedback). Usá **negrita** para lo clave.
- Cada vez que pasás a un paso, llamá assistant_step (focus). Si piden saltarlo, assistant_step (skip) y seguí con el siguiente pendiente. Un paso que no necesita nada, assistant_step (done).
- ${isNew ? "Proyecto nuevo: saludá en una frase y preguntá el nombre del proyecto y de qué trata." : "Proyecto existente: resumí en pocas líneas lo que ya tiene (estado abajo) y seguí por el primer paso pendiente. Nunca crees otro proyecto: todo va sobre este (projectId abajo)."}
- Si el primer mensaje trae un punto de partida (lo que la persona escribió en el chat), usalo: resumilo en pocas líneas, tomá todo lo que ya responde y preguntá SOLO lo que falta.
- Tiempos: calculá fechas con get_working_calendar (días hábiles y festivos). Si la fecha de cierre no alcanza para las tareas, avisalo con números.
- Equipo: proponé personas según su cargo (list_team_members) y su carga actual (get_team_workload); el rol en el proyecto es informativo.
- Fases y tareas: antes de proponer, llamá find_similar_projects. Basate en lo que contó la persona, en «Cómo trabaja» y los tipos de tarea de la empresa, y en esos proyectos; cuando uses uno, decí de cuál salió (ej. «En «Panaca web» el diseño tomó 12 días hábiles»). Si no hay parecidos, decilo y proponé desde cero. Cada tarea unida a su requerimiento, con responsable, tipo según la empresa, fechas y dependencias.
- Después de cada «Confirmar», revisá TODOS los resultados: si alguno falló («No se pudo…»), decí cuál (si llegó incompleto, deducilo comparando con lo que propusiste) y ofrecé reintentarlo; nunca des el bloque por completo si algo falló.
- Tras cada bloque creado, decí en una línea qué se creó con el link [Ver el proyecto](${appBase}/projects/<projectId>). Si algo falló, decí qué y por qué en lenguaje simple y ofrecé reintentarlo.
- Cuando los ${PROJECT_STEPS.length} pasos estén cubiertos, decilo, dá el link [Ver el cronograma](${appBase}/projects/<projectId>?view=gantt) y ofrecé cerrar o seguir agregando.
- Archivos: si suben uno, leelo con read_uploaded_file y usalo; cuando el proyecto exista, guardalo con add_project_files.
${
  companyEmpty
    ? isAdmin
      ? `- El perfil de la empresa está vacío. En tu PRIMER mensaje proponé completarlo antes con este link: [Completar el perfil de la empresa](${appBase}/company/assistant), y que si prefiere sigue sin él. Si sigue, no lo vuelvas a mencionar.`
      : "- El perfil de la empresa está vacío: decilo UNA vez en tu primer mensaje (un administrador todavía no lo cargó) y seguí normal."
    : ""
}
- Solo armar proyectos: si pide otra cosa, decile que eso va en el chat normal.
- Respuestas cortas. Nunca muestres ids ni claves de paso; quien ejecuta una tarea es «responsable».

${CLIENT_RULES}`;
}

function clientRules(botName: string, existing: boolean) {
  return `Sos ${botName}, en modo asistente de clientes de ProjectManagerSK. ${existing ? "Completás la ficha de un cliente que ya existe (datos abajo), conversando." : "Armás la ficha de un cliente nuevo conversando."}

Pasos, en este orden:
${stepList(CLIENT_STEPS)}

Reglas:
- Una pregunta por mensaje, corta y amable, con una frase de feedback antes. Usá **negrita** para lo clave.
- Cada vez que pasás a un paso, llamá assistant_step (focus); si piden saltarlo, assistant_step (skip); cuando un paso quedó respondido, assistant_step (done).
${
    existing
      ? `- Tu PRIMER mensaje va al grano: «A esta ficha le falta:» y el inventario de «LO QUE FALTA» (abajo), una línea corta por punto, sin preguntas dentro. Debajo, UNA sola pregunta por el primer punto, y ofrecé investigar al cliente en internet si sirve. Después, una pregunta por mensaje en orden lógico; cuando un punto queda resuelto, decí qué queda. No repases lo que ya tiene.
- Al guardar usá save_client con clientId y solo los campos que cambian; el perfil se reescribe completo sumando lo nuevo a lo que ya tenía.`
      : "- Primero el nombre: si ya existe un cliente parecido (list_clients), decilo y preguntá si es ese."
  }
- Al terminar (o antes, si la persona lo pide), en la MISMA respuesta mostrá la ficha armada en pocas líneas y proponé save_client con todo (name, contactName, contactEmail, contactPhone, website, profile y logoUrl si subió un logo). El botón «Confirmar» es la única autorización: nunca preguntes antes en texto si la guardás.
- Si suben un archivo, leelo con read_uploaded_file y usalo para la ficha.
- Solo la ficha del cliente: para proyectos u otras cosas, el asistente de proyectos o el chat normal.
- Respuestas cortas. Nunca muestres ids.

${CLIENT_RULES}`;
}

async function companyContext(me: Me) {
  const profile = await getCompanyProfile();
  const view = profileViewFor(profile, me.role === "ADMIN");
  const topics = view.topics.filter((t) => t.text !== "(sin información)").map((t) => `- ${t.topic}: ${t.text}`);
  return {
    empty: !profile.name && topics.length === 0,
    text: `Empresa: ${view.name ?? "(sin nombre)"}
${topics.length ? topics.join("\n") : "(perfil vacío)"}
${taskTypeContext(profile.taskTypes)}`,
  };
}

async function projectSnapshot(projectId: string) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true, description: true, startDate: true, targetEndDate: true, clientId: true, clientName: true,
      pm: { select: { name: true } },
      client: { select: { profile: true } },
      roles: { select: { role: true, user: { select: { name: true } } } },
      objectives: { select: { title: true } },
      requirements: { select: { title: true } },
      phases: { orderBy: { order: "asc" }, select: { name: true, tasks: { select: { title: true }, take: 40 } } },
      _count: { select: { tasks: true } },
    },
  });
  if (!p) return "(el proyecto ya no existe)";
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "(sin definir)");
  return `Proyecto en curso (projectId=${projectId}): ${p.name}
De qué trata: ${p.description?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "(pendiente)"}
Cliente: ${p.clientName ? `${p.clientName}${p.clientId ? ` (clientId=${p.clientId})` : ""}${p.client?.profile ? ` — ${p.client.profile.slice(0, 600)}` : ""}` : "(pendiente)"}
Inicio: ${day(p.startDate)} · Cierre: ${day(p.targetEndDate)} · PM: ${p.pm.name}
Equipo: ${p.roles.map((r) => `${r.user.name} (${r.role})`).join(", ") || "(pendiente)"}
Objetivos: ${p.objectives.map((o) => o.title).join(" | ") || "(pendiente)"}
Requerimientos: ${p.requirements.map((r) => r.title).join(" | ") || "(pendiente)"}
Fases y tareas (${p._count.tasks} tareas): ${p.phases.map((ph) => `${ph.name}: ${ph.tasks.map((t) => t.title).join(", ") || "(sin tareas)"}`).join(" || ")}`;
}

export type AssistantModeExtras = { mode: ConversationMode; created: { projectId: string | null; clientId: string | null } };

export function hiddenId(message: string, key: string) {
  return message.match(new RegExp(`${key}=([A-Za-z0-9_]+)`))?.[1] ?? null;
}

function baseMode(channel: ChatChannel, reads: string[], writes: string[], steps: readonly StepDef[]) {
  const created = { projectId: null as string | null, clientId: null as string | null };
  const writeNames = new Set(writes);
  const tools = [stepTool(steps), READ_WEB_PAGE_TOOL, ...pick(reads), ...pick(writes)];
  return {
    created,
    tools,
    writeNames,
    runRead: async (name: string, input: unknown): Promise<Anthropic.ToolResultBlockParam["content"]> => {
      if (name === "assistant_step") return "Listo.";
      if (name === "read_web_page") return runReadWebPage(input);
      if (!reads.includes(name) && name !== "find_similar_projects") return JSON.stringify({ error: "Esa herramienta no está disponible en este asistente." });
      return runReadTool(name, input);
    },
    runWrite: async (name: string, input: unknown) => {
      if (!writeNames.has(name)) return { ok: false, message: "Acción no disponible en este asistente." };
      const result = await runWriteTool(name, input);
      if (result.ok && name === "create_project") created.projectId = hiddenId(result.message, "projectId");
      if (result.ok && name === "save_client") created.clientId = hiddenId(result.message, "clientId");
      return result;
    },
    channel,
  };
}

export function projectAssistantMode(projectId: string | null, me: { id: string; role: string }): AssistantModeExtras {
  const base = baseMode(projectChannel(projectId), PROJECT_READS, PROJECT_WRITES, PROJECT_STEPS);
  const mode: ConversationMode = {
    channel: base.channel,
    pathname: projectId ? `/projects/assistant?project=${projectId}` : "/projects/assistant",
    system: async ({ botName, persona, me: who }) => {
      const company = await companyContext(who);
      const state = projectId ? await projectSnapshot(projectId) : "Proyecto nuevo: todavía no fue creado.";
      return [
        { type: "text", text: `${projectRules(botName, !projectId, me.role === "ADMIN", company.empty)}\n\n${await webResearchRules("el cliente y su sector")}\n\n${persona}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: `${company.text}\n\n${await appliedRulesText(me)}\n\n${state}\n\nFecha de hoy: ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())}. Quien conversa: ${who.name} (userId=${who.id}).` },
      ];
    },
    tools: async () => [...base.tools, SIMILAR_TOOL],
    writeNames: base.writeNames,
    runRead: async (name, input) => {
      if (name !== "find_similar_projects") return base.runRead(name, input);
      const parsed = z.object({ clientId: z.string().optional(), text: z.string() }).safeParse(input);
      if (!parsed.success) return JSON.stringify({ error: "Falta indicar de qué trata el proyecto." });
      const found = await similarProjects(me.id, { projectId, clientId: parsed.data.clientId ?? null, text: parsed.data.text });
      return JSON.stringify(found.length ? found : { note: "No hay proyectos parecidos." });
    },
    runWrite: base.runWrite,
    summarize: summarizeWriteTool,
    isDestructive: isDestructiveTool,
    persistSteps: true,
    showResult: (n) => base.writeNames.has(n),
    webSearch: true,
  };
  return { mode, created: base.created };
}

async function clientFacts(clientId: string) {
  return prisma.client.findUnique({ where: { id: clientId }, select: { name: true, logoUrl: true, contactName: true, contactEmail: true, contactPhone: true, website: true, profile: true } });
}

export function clientAssistantMode(clientId: string | null = null): AssistantModeExtras {
  const base = baseMode(clientChannel(clientId), CLIENT_READS, CLIENT_WRITES, CLIENT_STEPS);
  const mode: ConversationMode = {
    channel: base.channel,
    pathname: clientId ? `/clients/assistant?client=${clientId}` : "/clients/assistant",
    system: async ({ botName, persona, me }) => {
      const company = await companyContext(me);
      const c = clientId ? await clientFacts(clientId) : null;
      const state = c
        ? `Cliente en curso (clientId=${clientId}): ${c.name}
Contacto: ${[c.contactName, c.contactEmail, c.contactPhone].filter(Boolean).join(" · ") || "(sin datos)"} · Web: ${c.website ?? "(sin datos)"} · Logo: ${c.logoUrl ? "sí" : "no"}
Perfil actual: ${c.profile?.trim() || "(vacío)"}
LO QUE FALTA (calculado por la app):${clientGaps(c).length ? `\n${clientGaps(c).map((g) => `- ${g}`).join("\n")}` : " nada, la ficha está completa"}`
        : "Cliente nuevo: todavía no fue creado.";
      return [
        { type: "text", text: `${clientRules(botName, Boolean(clientId))}\n\n${await webResearchRules("el cliente y su sector")}\n\n${persona}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: `${company.text}\n\n${state}\n\nFecha de hoy: ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())}.` },
      ];
    },
    tools: async () => base.tools,
    writeNames: base.writeNames,
    runRead: base.runRead,
    runWrite: base.runWrite,
    summarize: summarizeWriteTool,
    isDestructive: () => false,
    persistSteps: true,
    showResult: (n) => base.writeNames.has(n),
    webSearch: true,
  };
  return { mode, created: base.created };
}

async function historyContents(userId: string, channel: ChatChannel) {
  const rows = await prisma.botMessage.findMany({ where: { userId, channel, role: "assistant" }, orderBy: { createdAt: "asc" }, select: { content: true } });
  return rows.map((r) => r.content);
}

export async function projectSteps(userId: string, projectId: string | null) {
  const facts = projectId
    ? await prisma.project
        .findUnique({
          where: { id: projectId },
          select: { description: true, clientId: true, targetEndDate: true, phases: { select: { name: true } }, _count: { select: { roles: true, objectives: true, requirements: true, tasks: true } } },
        })
        .then((p) =>
          p
            ? { description: p.description, clientId: p.clientId, targetEndDate: p.targetEndDate, roles: p._count.roles, objectives: p._count.objectives, requirements: p._count.requirements, tasks: p._count.tasks, phaseNames: p.phases.map((ph) => ph.name) }
            : null
        )
    : null;
  return stepStates(PROJECT_STEPS, projectCoverage(facts), stepMarksFromHistory(await historyContents(userId, projectChannel(projectId))));
}

export async function clientSteps(userId: string, clientId: string | null = null) {
  const facts = clientId ? await clientFacts(clientId) : null;
  return stepStates(CLIENT_STEPS, clientCoverage(facts), stepMarksFromHistory(await historyContents(userId, clientChannel(clientId))));
}

export async function moveNewProjectConversation(userId: string, projectId: string) {
  await prisma.botMessage.updateMany({ where: { userId, channel: NEW_PROJECT_CHANNEL }, data: { channel: projectChannel(projectId) } });
}

export async function canUseProjectAssistant(user: { id: string; role: string }, projectId: string | null) {
  if (projectId) return Boolean(await getProjectAdmin(projectId, trustedActor(user)));
  return canCreateProjects(user);
}

export const taskChannel = (projectId: string, taskId: string | null): ChatChannel => (taskId ? `task:${taskId}` : `task:new:${projectId}`);

const TASK_READS = [
  "read_uploaded_file",
  "list_team_members",
  "get_team_workload",
  "get_working_calendar",
  "get_project_definition",
  "list_project_tasks",
  "get_task_details",
  "get_task_design",
  "list_tags",
  "list_test_templates",
];
const TASK_WRITES = [
  "create_task",
  "update_task",
  "update_task_schedule",
  "reassign_task",
  "set_task_reviewers",
  "set_task_dependency",
  "set_task_tag",
  "add_checklist_steps",
  "add_task_files",
  "design_task",
  "set_test_template",
];

function taskRules(botName: string, projectId: string, taskId: string | null) {
  const appBase = appUrl() ?? "";
  return `Sos ${botName}, en modo asistente de tareas de ProjectManagerSK. Ayudás al PM o a un administrador a ${taskId ? "completar una tarea ya creada" : "crear una o varias tareas en el proyecto"} conversando.

Pasos, en este orden:
${stepList(TASK_STEPS)}

Reglas:
- Una pregunta por mensaje, corta y amable, con una frase de feedback antes. Usá **negrita** para lo clave. Cada vez que pasás a un paso, assistant_step (focus); si piden saltarlo, skip; si ya quedó claro sin crear nada, done.
- Tarea existente: tu PRIMER mensaje va al grano: «A esta tarea le falta:» y el inventario de «LO QUE FALTA» (abajo), una línea corta por punto, en ese orden, sin preguntas ni explicaciones dentro de la lista. No repases lo que ya tiene. Debajo, UNA sola pregunta: la del primer punto (los insumos primero: casi nunca se cargan; pedí algo concreto según la tarea, ej. «el texto de la página», «los accesos al hosting»).
- Después seguí paso a paso, conversando: una pregunta por mensaje, en orden lógico, nunca varias juntas. Cuando un punto queda resuelto, decí en una línea qué queda y preguntá por el siguiente. Si no falta nada, decilo en una línea y preguntá si quiere cambiar algo.
- El paso marcado tiene que coincidir con lo que preguntás: antes de preguntar, assistant_step (focus) con el paso del punto (insumos o checklist → checklist; descripción → what; requerimiento → phase; responsable o revisores → people; pruebas o ítems → design).
- Si el primer mensaje trae un punto de partida (lo escrito en el formulario o en el chat), usalo: resumilo en pocas líneas, marcá como done los pasos que ya responde y preguntá SOLO lo que falta. Nunca vuelvas a preguntar lo que ya está.
- Tipo: DEDUCILO de lo que ya se dijo; no lo preguntes si hay pistas. Qué es cada uno (salvo que la equivalencia de la empresa, abajo, diga otra cosa):
  · Aceptación: la ve, aprueba o comenta el CLIENTE (o alguien de afuera del equipo), por secciones o ítems, en lenguaje sencillo. Pistas: «aceptación», «cliente», «la usuaria/el usuario la revisa o aprueba», «que diga qué quiere cambiar», «lenguaje sencillo».
  · Prueba: QA INTERNA; alguien del equipo verifica que lo construido funciona, con una lista de pruebas técnicas.
  · Ajuste: lista de cambios ya pedidos para hacer.
  · Entregable: deja un archivo o producto concreto. Simple: lo demás.
  «Revisar» no significa Prueba: si quien revisa es el cliente o un usuario final, es Aceptación. Si la persona nombra un tipo («de aceptación», «de pruebas»), ese es el tipo. Si el pedido dice que lo revisa, aprueba o responde un cliente o alguien externo, es Aceptación y NO se pregunta nada del tipo. Solo si de verdad no hay pistas, hacé UNA pregunta sobre la naturaleza (¿quién la revisa: el equipo o el cliente?). Nunca menciones los tipos en una pregunta, ni como opciones ni entre paréntesis: quien conversa no tiene por qué conocerlos. Mencioná el tipo en el resumen en palabras de la empresa.
- Fase y requerimiento: usá get_project_definition; proponé la fase y el requerimiento al que responde.
- Responsable y revisores: según cargo (list_team_members) y carga (get_team_workload). Revisores solo si la tarea se revisa.
- Fechas y dependencias: mirá tareas parecidas del proyecto (list_project_tasks) y, si sirve, find_similar_projects; calculá con get_working_calendar; proponé inicio, duración y de qué tarea depende.
- Checklist e insumos: proponé pasos concretos (add_checklist_steps); si suben archivos, leelos con read_uploaded_file y adjuntalos (add_task_files).
- Pruebas o ítems: solo si es Prueba, Ajuste o Aceptación, armá la lista con design_task (o la plantilla con set_test_template). Si no aplica, assistant_step (done).
- Autorización (UNA sola por tarea): cuando la tarea está lista, en la MISMA respuesta escribí un resumen corto y proponé TODAS sus escrituras (create_task con projectId=${projectId}, phaseName, type, title, description, plannedStart, durationDays, assigneeIds, reviewerIds, requirementTitles, tags; y add_checklist_steps / set_task_dependency por títulos / design_task si ya se conoce). El botón «Confirmar» es la única autorización: nunca preguntes antes en texto. Las escrituras que necesitan el id de la tarea nueva van en la confirmación siguiente.
- Después de cada «Confirmar», revisá todos los resultados: si algo falló, decí qué y ofrecé reintentarlo.
- Al terminar una tarea, dá el link [Ver la tarea](${appBase}/projects/${projectId}/tasks/<taskId>)${taskId ? "" : " y preguntá si hay otra tarea para crear"}.
- Solo tareas de este proyecto. Respuestas cortas. Nunca muestres ids ni claves de paso; quien ejecuta una tarea es «responsable».`;
}

async function taskSnapshot(taskId: string) {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true, type: true, description: true, plannedStart: true, plannedEnd: true,
      phase: { select: { name: true } },
      requirements: { select: { title: true } },
      assignees: { select: { user: { select: { name: true } } } },
      reviewers: { select: { user: { select: { name: true } } } },
      steps: { select: { description: true, done: true }, orderBy: { order: "asc" } },
      _count: { select: { attachments: true, adjustmentItems: true } },
    },
  });
  if (!t) return "(la tarea ya no existe)";
  return `Tarea en curso (taskId=${taskId}): ${t.title} · tipo ${t.type} · fase ${t.phase.name}
Descripción: ${t.description?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "(pendiente)"}
Requerimientos: ${t.requirements.map((r) => r.title).join(" | ") || "(ninguno)"}
Responsables: ${t.assignees.map((a) => a.user.name).join(", ") || "(ninguno)"} · Revisores: ${t.reviewers.map((r) => r.user.name).join(", ") || "(ninguno)"}
Fechas: ${t.plannedStart.toISOString().slice(0, 10)} a ${t.plannedEnd.toISOString().slice(0, 10)}
Checklist: ${t.steps.map((s) => `${s.done ? "[x]" : "[ ]"} ${s.description}`).join(" | ") || "(vacío)"}
Archivos: ${t._count.attachments} · Ítems de ajuste: ${t._count.adjustmentItems}
`;
}

export function taskAssistantMode(projectId: string, taskId: string | null, me: { id: string; role: string }): AssistantModeExtras {
  const base = baseMode(taskChannel(projectId, taskId), TASK_READS, TASK_WRITES, TASK_STEPS);
  const mode: ConversationMode = {
    channel: base.channel,
    pathname: `/tasks/assistant?project=${projectId}${taskId ? `&task=${taskId}` : ""}`,
    system: async ({ botName, persona, me: who }) => {
      const company = await companyContext(who);
      const facts = taskId ? await taskFacts(taskId) : null;
      const gaps = facts ? taskGaps(facts) : [];
      const state = taskId
        ? `${await taskSnapshot(taskId)}\nLO QUE FALTA (calculado por la app): ${gaps.length ? `\n${gaps.map((g) => `- ${g}`).join("\n")}` : "nada, la tarea está completa"}`
        : "Tarea nueva: todavía no fue creada.";
      return [
        { type: "text", text: `${taskRules(botName, projectId, taskId)}\n\n${persona}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: `${company.text}\n\n${await appliedRulesText(me)}\n\n${await projectSnapshot(projectId)}\n\n${state}\n\nFecha de hoy: ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())}. Quien conversa: ${who.name} (userId=${who.id}).` },
      ];
    },
    tools: async () => [...base.tools, SIMILAR_TOOL],
    writeNames: base.writeNames,
    runRead: async (name, input) => {
      if (name !== "find_similar_projects") return base.runRead(name, input);
      const parsed = z.object({ clientId: z.string().optional(), text: z.string() }).safeParse(input);
      if (!parsed.success) return JSON.stringify({ error: "Falta indicar de qué trata." });
      return JSON.stringify(await similarProjects(me.id, { projectId, clientId: parsed.data.clientId ?? null, text: parsed.data.text }));
    },
    runWrite: base.runWrite,
    summarize: summarizeWriteTool,
    isDestructive: isDestructiveTool,
    persistSteps: true,
    showResult: (n) => base.writeNames.has(n),
  };
  return { mode, created: base.created };
}

async function taskFacts(taskId: string): Promise<TaskFacts | null> {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      description: true, type: true, defaultTestTemplateId: true, projectId: true,
      reviewRounds: { take: 1, orderBy: { roundNumber: "desc" }, select: { _count: { select: { checks: true } } } },
      _count: { select: { requirements: true, assignees: true, reviewers: true, steps: true, adjustmentItems: true, taskTags: true } },
    },
  });
  if (!t) return null;
  const [insumos, projectTags] = await Promise.all([
    prisma.attachment.count({ where: { taskId, kind: "INSUMO" } }),
    prisma.tag.count({ where: { projectId: t.projectId } }),
  ]);
  return {
    description: t.description, type: t.type, requirements: t._count.requirements, assignees: t._count.assignees, reviewers: t._count.reviewers,
    steps: t._count.steps, insumos, tags: t._count.taskTags, projectUsesTags: projectTags > 0,
    designItems: t._count.adjustmentItems + (t.reviewRounds[0]?._count.checks ?? 0) + (t.defaultTestTemplateId ? 1 : 0),
  };
}

export async function taskSteps(userId: string, projectId: string, taskId: string | null) {
  const facts = taskId ? await taskFacts(taskId) : null;
  return stepStates(TASK_STEPS, taskCoverage(facts), stepMarksFromHistory(await historyContents(userId, taskChannel(projectId, taskId))));
}

export async function canUseTaskAssistant(user: { id: string; role: string }, projectId: string, taskId: string | null) {
  if (taskId && !(await prisma.task.count({ where: { id: taskId, projectId } }))) return false;
  return Boolean(await getProjectAdmin(projectId, trustedActor(user)));
}

export async function chatSeed(userId: string): Promise<string | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.botMessage.findMany({
    where: { userId, role: "user", channel: { in: ["web", "whatsapp"] }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { content: true },
  });
  const texts = rows
    .reverse()
    .flatMap((r) => (JSON.parse(r.content) as Array<{ type: string; text?: string }>).filter((b) => b.type === "text" && b.text?.trim()).map((b) => b.text!.trim()));
  return texts.length ? `Punto de partida (lo que conté en el chat):\n${texts.map((t) => `- ${t}`).join("\n")}` : null;
}
