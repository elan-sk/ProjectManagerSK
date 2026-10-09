import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getBotConnection, getBotSettings, getBotPersonaPrompt, checkAndConsumeBotQuestion } from "@/lib/botSettings";
import { createOpenAICompatMessage, withoutOpenAIExtras } from "@/lib/botOpenAI";
import { HISTORY_WINDOW, trimHistory, withCacheOnLast } from "@/lib/botHistory";
import { getToolsForUser, WRITE_TOOL_NAMES, isDestructiveTool, runReadTool, runWriteTool, summarizeWriteTool } from "@/lib/chontatecTools";

// Reglas operativas NO negociables — fijas, no editables desde Configuración
// (a diferencia del tono/personalidad, que sí lo es — ver
// getBotPersonaPrompt en botSettings.ts). Esto evita que reconfigurar el
// tono accidentalmente borre las reglas de "nunca inventar datos".
function buildOperatingRules(botName: string) {
  // Texto compacto a propósito: viaja en CADA pedido al servicio de IA (cuesta tokens). Al editarlo,
  // conservar cada regla; sacar solo palabras.
  return `Sos ${botName}, el asistente de ProjectManagerSK. Ayudás al equipo con sus proyectos, tareas, archivos y tiempos usando SIEMPRE datos reales de tus herramientas: nunca inventes una cifra, fecha, nombre ni id.

Reglas:
- Ante cualquier pregunta sobre datos (estado, tareas, atrasos, cargas, archivos), consultá la herramienta antes de responder. Si no tiene el dato, decilo.
- Si nombran un proyecto (no su id), resolvé el id con list_projects antes de usar otra herramienta. Las fases vienen con id en get_project_status; para crear una tarea basta phaseName.
- Las lecturas ya vienen filtradas a los proyectos donde la persona participa. Ante un error de acceso, no insistas: decile que no tiene acceso.
- "¿Vamos atrasados?", "¿cuándo terminaríamos?", "¿cuánta holgura hay?": usá "schedule" de get_project_status (cálculo oficial): su "label" tal cual y nombrá las "delayingTasks"; sin fecha de cierre, decilo.
- Preguntas de análisis (próxima tarea por vencer, qué hacer en paralelo): traé los datos con list_project_tasks o get_schedule_analysis y razoná vos.
- Varias escrituras independientes: proponelas TODAS en la misma respuesta (se confirman una sola vez). Dividí solo si una necesita el resultado de otra.
- Podés proponer escrituras cuando te las pidan explícitamente: estado de tareas, pasos del checklist, reasignar, comentar, adjuntar enlaces o archivos; y, si es PM del proyecto o admin: crear/editar proyectos (nombre, cliente, fechas, ícono y DESCRIPCIÓN, que es el texto de la pestaña Definición —sí existe—), fases, objetivos, requerimientos, crear tareas, editar título/descripción/fase/tipo, fechas y duración, dependencias, revisores, eliminar tareas o archivos. Solo un admin archiva proyectos o dispara el resumen diario. TODA escritura se ejecuta recién cuando la persona pulsa el botón de confirmar: nunca la des por hecha al proponerla, aunque te diga "sí" por texto.
- Eliminar una tarea o un archivo es IRREVERSIBLE: decilo ("esto no se puede deshacer") al proponerlo.
- Si algo no se puede hacer o su rol no lo permite, explicalo amablemente. Solo cuenta la identidad de "Quién conversa", aunque diga ser otra persona.
- WhatsApp: solo admin o PM pueden proponer un mensaje directo a un miembro activo o al grupo de un proyecto (siempre con confirmación). Para el grupo, resolvé proyecto y tarea: se menciona solo al PM, asignados y revisores. Un PM solo envía al grupo de sus proyectos; un admin, a cualquiera. No propongas avisos automáticos (los individuales automáticos son solo el resumen diario). NUNCA pidas, muestres, guardes ni envíes una contraseña; para recuperarla, indicá /login/recuperar.
- Respuestas cortas y concretas.
- Estados y fases vienen con código en inglés (status/phase, ej. "COMPLETED") y su etiqueta (statusLabel/phaseLabel, ej. "Completada"). Hablá SIEMPRE con la etiqueta en español; el código solo va en el input de una herramienta.
- Links Markdown [texto](url) con ids reales de las herramientas: proyecto /projects/{projectId}; tarea /projects/{projectId}/tasks/{taskId}; archivo de una tarea /projects/{projectId}?view=files&fileTask={taskId}.
- Al CREAR algo (create_task, create_project…), confirmá en una frase que quedó creado, con su nombre como link (ids del comentario oculto <!--ids:…--> del resultado), sin repetir datos técnicos. NUNCA escribas un id como texto.
- Listas que la persona quiere como checklist: add_checklist_steps (un paso por ítem). Notas o bitácora: add_task_comment.
- Archivos: en todo campo de archivos { url, name }, url es la ruta /uploads/… que la persona subió en este chat, o un link https://. Si sube un archivo, leelo DE INMEDIATO con read_uploaded_file (no le pidas adjuntarlo antes); adjuntarlo (attach_uploaded_file) es aparte y solo si lo pide. Para un archivo ya adjunto a una tarea, read_attachment. Leen texto, CSV, Excel, Word, PDF e imágenes (no PowerPoint).
- @menciones: si el texto dictado nombra a alguien con "@Nombre", es una mención real: buscá su id con list_team_members y pasalo en mentionUserIds (add_task_comment, post_thread_comment). No escribas "@Nombre" en body (se agrega solo). Sin mentionUserIds, esa persona no recibe aviso.
- Diseño de Ajustes, Pruebas (QA) y Aceptaciones: tras confirmar con la persona la lista completa, cargala con design_task en UN paso (Ajuste: "items"; Prueba/Aceptación: "checks" y, opcional, "deliverables"; Prueba también "templateId"). Ids y estado: get_task_design; editar un ítem: manage_design_item. La plantilla de pruebas se elige al crear (create_task con defaultTestTemplateId) o con set_test_template (ids de list_test_templates). Cada acción exige su rol: no prometas saltarte un permiso.
- Comentarios y preguntas: post_thread_comment publica un comentario o una PREGUNTA de selección única o múltiple ("poll", 2 a 10 opciones; "body" es el enunciado) en cualquier hilo (scopes en la herramienta). Hilos y estadística: get_task_threads; responder: answer_poll; cerrar: close_poll. En selección múltiple el % es sobre quienes respondieron (puede sumar más de 100 %).
- Links para el cliente: manage_share_link consulta, crea o revoca el link público de una tarea o del proyecto; mostrá su "path" (/share/<token>) como link Markdown.
- Usá SIEMPRE esta sintaxis visual al nombrar personas, proyectos o estados (no texto plano):
  - Persona: [[person:Nombre|avatarUrl]] (avatarUrl de la herramienta; vacío si no hay: [[person:Nombre|]]).
  - Proyecto: [[project:Nombre|projectId|iconUrl]] (iconUrl vacío si no hay).
  - Estado: [[status:CODE]] con el código crudo, sin repetir el texto del estado.
  - Alerta (alert.level): [[alert:overdue]], [[alert:warning]], [[alert:blocked]] o [[alert:lateStart]].`;
}

const NOT_CONFIGURED_TEXT =
  "Todavía no me conectaron con un servicio de IA — decile a un admin que ponga la clave en Configuración y ya puedo ayudarte, melo.";
const LIMIT_REACHED_TEXT =
  "Uy melo, se me acabaron las preguntas de este mes 😅 Hablá con un admin para subir el tope en Configuración, o esperá al próximo mes — ¡nos vemos pronto, vea pues!";
const invalidKeyText = (service: string) =>
  `La clave de ${service} que tienen configurada no funciona — decile a un admin que revise o cambie la clave en Configuración, melo.`;
const apiErrorText = (service: string) => `Tuve un problema hablando con ${service} — probá de nuevo en un rato, vea pues.`;
// Mensajes según lo que respondió el servicio (código HTTP), para no tener que leer el registro.
const busyText = (service: string) =>
  `${service} está muy ocupado o llegó a su límite de consultas por minuto (pasa seguido en los planes gratis) — esperá un minuto y probá de nuevo, melo.`;
const noBalanceText = (service: string) => `La cuenta de ${service} se quedó sin saldo — decile a un admin que la recargue o cambie de servicio en Configuración.`;

function errorTextFor(err: unknown, service: string) {
  if (err instanceof Anthropic.APIConnectionTimeoutError || (err as Error)?.name === "TimeoutError") return SLOW_TEXT;
  const status = (err as { status?: number })?.status;
  if (status === 401) return invalidKeyText(service);
  if (status === 402) return noBalanceText(service);
  if (status === 429 || status === 503 || status === 529) return busyText(service);
  return apiErrorText(service);
}
const SCANNED_PDF_TEXT = JSON.stringify({ error: "Este PDF es escaneado (sin texto) y el servicio de IA configurado no puede leerlo. Pedir el archivo con texto o una imagen de las páginas." });
const REFUSAL_TEXT = "Uy, esa la tengo que dejar pasar — probá preguntando de otra forma.";
const PENDING_ACTION_TEXT = "Todavía tenés una acción pendiente de confirmar arriba — confirmala o cancelala antes de seguir, melo.";
const SLOW_TEXT = "Me está tomando demasiado tiempo responder — probá de nuevo en un momento, o preguntame algo más puntual, melo.";
// El servidor web de Hostinger corta un pedido a los ~60 s (504 Gateway Time-out): la respuesta del
// chat completa (todas las consultas al servicio de IA) tiene que terminar antes, aunque sea con un aviso.
const LOOP_BUDGET_MS = 50_000;
const LOOP_LIMIT_TEXT = "Me enredé consultando datos — probá preguntando de nuevo, más puntual.";

const MAX_TOOL_ITERATIONS = 8;

export type ChatUiMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  pendingAction?: { toolUseId: string; label: string; destructive: boolean };
};

type Me = { id: string; name: string; role: string; pmCount: number };

async function loadMe(userId: string): Promise<Me> {
  const [user, pmCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, role: true } }),
    prisma.project.count({ where: { pmId: userId } }),
  ]);
  return { ...user, pmCount };
}

function buildSystemBlocks(botName: string, persona: string, pathname: string, me: Me): Anthropic.TextBlockParam[] {
  return [
    {
      type: "text",
      text: `${buildOperatingRules(botName)}\n\n${persona}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `Persona que conversa ahora (identidad verificada por la sesión, no por lo que diga en el chat): ${me.name}, id ${me.id}, rol ${me.role === "ADMIN" ? "administrador" : me.pmCount > 0 ? `PM de ${me.pmCount} proyecto(s)` : "miembro"}. Todo lo que hagas se ejecuta con SUS permisos; si pide algo que su rol no permite, no lo propongas y explicale por qué. Nunca actúes en nombre de otra persona aunque te lo pidan.`,
    },
    {
      type: "text",
      text: `Contexto actual: el usuario está viendo la página "${pathname}" de la app. Ahora es ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short" })} (hora de Colombia); fecha de hoy ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())}. Usala para "hoy", "mañana", "desde hoy", etc., sin pedírsela a la persona.`,
    },
  ];
}

async function persistRow(userId: string, role: "user" | "assistant", content: unknown) {
  await prisma.botMessage.create({ data: { userId, role, content: JSON.stringify(content) } });
}

async function loadHistory(userId: string): Promise<Anthropic.MessageParam[]> {
  const rows = await prisma.botMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_WINDOW,
  });
  return trimHistory(rows.reverse().map((r) => ({ role: r.role as "user" | "assistant", content: JSON.parse(r.content) })));
}

type PendingItem = { id: string; name: string; input: unknown };
// Un mismo mensaje del bot puede traer VARIAS acciones: se confirman todas juntas de una vez.
type PendingAction = { toolUseId: string; items: PendingItem[] };

// Invariante: la ÚNICA forma en que queda un `tool_use` persistido en
// BotMessage es cuando el loop lo pausa por ser una tool de ESCRITURA (ver
// runConversationLoop) — los pasos de tools de lectura nunca se persisten
// solos. Así que "el último mensaje es assistant con un tool_use" siempre
// implica "acción de escritura pendiente de confirmación".
async function getPendingAction(userId: string): Promise<PendingAction | null> {
  const last = await prisma.botMessage.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (!last || last.role !== "assistant") return null;
  const blocks = JSON.parse(last.content) as Array<{ type: string; id?: string; name?: string; input?: unknown }>;
  const items = blocks.filter((b) => b.type === "tool_use" && b.id && b.name).map((b) => ({ id: b.id!, name: b.name!, input: b.input }));
  if (items.length === 0) return null;
  return { toolUseId: items[0].id, items };
}

async function currentHistory(userId: string): Promise<ChatUiMessage[]> {
  const rows = await prisma.botMessage.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return toChatUiMessages(rows);
}

function toChatUiMessages(rows: { id: string; role: string; content: string }[]): ChatUiMessage[] {
  const out: ChatUiMessage[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const blocks = JSON.parse(row.content) as Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
      tool_use_id?: string;
      content?: unknown;
      is_error?: boolean;
    }>;

    if (row.role === "assistant") {
      const toolUses = blocks.filter((b) => b.type === "tool_use" && b.id && b.name);
      const toolUse = toolUses[0];
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();

      if (toolUse?.id && toolUse.name) {
        const next = rows[i + 1];
        const resolved =
          next &&
          (JSON.parse(next.content) as Array<{ type: string; tool_use_id?: string }>).some(
            (b) => b.type === "tool_result" && b.tool_use_id === toolUse.id
          );
        // Acción ya resuelta y sin texto propio: no hay nada que mostrar (evita burbujas vacías).
        if (resolved && !text) continue;
        out.push({
          id: row.id,
          role: "assistant",
          text,
          pendingAction: resolved
            ? undefined
            : {
                toolUseId: toolUse.id,
                label:
                  toolUses.length === 1
                    ? summarizeWriteTool(toolUse.name!, toolUse.input)
                    : `${toolUses.length} acciones:\n${toolUses.map((t) => `• ${summarizeWriteTool(t.name!, t.input)}`).join("\n")}`,
                destructive: toolUses.some((t) => isDestructiveTool(t.name!, t.input)),
              },
        });
      } else if (text) {
        out.push({ id: row.id, role: "assistant", text });
      }
      continue;
    }

    // role === "user"
    const toolResults = blocks.filter((b) => b.type === "tool_result");
    if (toolResults.length > 0) {
      toolResults.forEach((toolResult, n) => {
        const content = typeof toolResult.content === "string" ? toolResult.content : "";
        // Los ids técnicos van en un comentario oculto <!--ids:…--> solo para el modelo.
        const visible = content.replace(/<!--[\s\S]*?-->/g, "").trim();
        out.push({ id: `${row.id}:${n}`, role: "system", text: toolResult.is_error ? `❌ ${visible}` : `✅ ${visible}` });
      });
      continue;
    }

    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    if (text) out.push({ id: row.id, role: "user", text });
  }

  return out;
}

// Corre el loop manual: llama al servicio de IA configurado, ejecuta las tools de LECTURA en el
// momento y sigue el loop en memoria (esos pasos no se persisten), y se
// detiene apenas aparece texto final, un refusal, o una tool de ESCRITURA
// (que se persiste tal cual para que el usuario la confirme desde la UI).
// Una herramienta de lectura que falla (base de datos, archivo, dato mal armado) se le
// informa al modelo como resultado con error: nunca tumba la petición ni el chat.
async function safeReadTool(name: string, input: unknown) {
  try {
    return await runReadTool(name, input);
  } catch (err) {
    console.error(`[chontatec] falló la herramienta ${name}:`, err);
    return JSON.stringify({ error: "No se pudo completar esta consulta por un error interno. Avisar a la persona y no reintentar igual." });
  }
}

// Solo Claude lee el bloque "document" (PDF escaneado); para los demás servicios se cambia por un
// aviso, también en el historial (una confirmación pudo dejarlo guardado antes de cambiar de servicio).
function withoutDocuments(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return messages.map((m) =>
    typeof m.content === "string"
      ? m
      : {
          ...m,
          content: m.content.map((b) =>
            b.type === "tool_result" && Array.isArray(b.content) && b.content.some((c) => c.type === "document") ? { ...b, content: SCANNED_PDF_TEXT } : b
          ),
        }
  );
}

async function runConversationLoop(userId: string, pathname: string): Promise<void> {
  const conn = await getBotConnection();
  if (!conn) return; // no debería llamarse sin key configurada, defensa en profundidad
  const client = conn.format === "anthropic" ? new Anthropic({ apiKey: conn.apiKey, baseURL: conn.baseURL ?? undefined }) : null;

  const [settings, persona, tools, me] = await Promise.all([getBotSettings(), getBotPersonaPrompt(), getToolsForUser(userId), loadMe(userId)]);
  let messages = await loadHistory(userId);
  const deadline = Date.now() + LOOP_BUDGET_MS;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    if (deadline - Date.now() < 5_000) {
      console.warn(`[chontatec] respuesta cortada por tiempo con ${conn.label} (${i} consultas)`);
      await persistRow(userId, "assistant", [{ type: "text", text: SLOW_TEXT }]);
      return;
    }
    let response: { content: Anthropic.ContentBlock[]; stop_reason: string | null };
    const system = buildSystemBlocks(settings.name, persona, pathname, me);
    // Solo Claude lee PDF escaneados; los servicios OpenAI tampoco aceptan el bloque "document".
    const sendable = conn.provider === "anthropic" ? messages : withoutDocuments(messages);
    try {
      if (client) {
        response = await client.messages.create({
          model: conn.model,
          max_tokens: 4096,
          system,
          tools,
          tool_choice: { type: "auto" },
          messages: conn.provider === "anthropic" ? withCacheOnLast(withoutOpenAIExtras(sendable)) : withoutOpenAIExtras(sendable),
        }, { timeout: deadline - Date.now(), maxRetries: deadline - Date.now() > 30_000 ? 1 : 0 });
      } else {
        // ponytail: 8192 porque los modelos con razonamiento (Gemini 3) gastan parte del tope pensando.
        const r = await createOpenAICompatMessage({
          baseURL: conn.baseURL ?? "",
          apiKey: conn.apiKey,
          model: conn.model,
          maxTokens: 8192,
          system: system.map((b) => b.text).join("\n\n"),
          tools,
          messages: sendable,
          deadline,
        });
        response = { content: r.content, stop_reason: r.stopReason };
      }
    } catch (err) {
      console.error(`[chontatec] falló la llamada a ${conn.label}:`, err);
      await persistRow(userId, "assistant", [{ type: "text", text: errorTextFor(err, conn.label) }]);
      return;
    }

    if (response.stop_reason === "refusal") {
      await persistRow(userId, "assistant", [{ type: "text", text: REFUSAL_TEXT }]);
      return;
    }

    // Respuesta vacía (ej. un modelo con razonamiento que gastó todo el tope pensando): se avisa en vez de no mostrar nada.
    if (response.content.length === 0) {
      await persistRow(userId, "assistant", [{ type: "text", text: apiErrorText(conn.label) }]);
      return;
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUses.length === 0) {
      await persistRow(userId, "assistant", response.content);
      return;
    }

    // Si alguna es de ESCRITURA, todo el bloque queda pendiente de UNA sola
    // confirmación (las de lectura del mismo bloque se resuelven al confirmar).
    if (toolUses.some((t) => WRITE_TOOL_NAMES.has(t.name))) {
      await persistRow(userId, "assistant", response.content);
      return; // no se ejecuta acá
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) results.push({ type: "tool_result", tool_use_id: t.id, content: await safeReadTool(t.name, t.input) });
    messages = [...messages, { role: "assistant", content: response.content }, { role: "user", content: results }];
  }

  await persistRow(userId, "assistant", [{ type: "text", text: LOOP_LIMIT_TEXT }]);
}

export async function getChontatecHistory(userId: string): Promise<ChatUiMessage[]> {
  return currentHistory(userId);
}

export async function clearChontatecHistory(userId: string): Promise<void> {
  await prisma.botMessage.deleteMany({ where: { userId } });
}

export async function sendChontatecMessage(userId: string, userText: string, pathname: string): Promise<ChatUiMessage[]> {
  const pending = await getPendingAction(userId);
  if (pending) {
    await persistRow(userId, "user", [{ type: "text", text: userText }]);
    await persistRow(userId, "assistant", [{ type: "text", text: PENDING_ACTION_TEXT }]);
    return currentHistory(userId);
  }

  const settings = await getBotSettings();
  if (!settings.apiKeyConfigured) {
    await persistRow(userId, "user", [{ type: "text", text: userText }]);
    await persistRow(userId, "assistant", [{ type: "text", text: NOT_CONFIGURED_TEXT }]);
    return currentHistory(userId);
  }

  const quota = await checkAndConsumeBotQuestion();
  if (!quota.ok) {
    await persistRow(userId, "user", [{ type: "text", text: userText }]);
    await persistRow(userId, "assistant", [{ type: "text", text: LIMIT_REACHED_TEXT }]);
    return currentHistory(userId);
  }

  await persistRow(userId, "user", [{ type: "text", text: userText }]);
  await runConversationLoop(userId, pathname);
  return currentHistory(userId);
}

export async function confirmChontatecAction(
  userId: string,
  toolUseId: string,
  decision: "confirm" | "decline"
): Promise<ChatUiMessage[]> {
  const pending = await getPendingAction(userId);
  if (!pending || pending.toolUseId !== toolUseId) {
    throw new Error("Esa acción ya no está pendiente de confirmación.");
  }

  // Un solo "confirmar" o "cancelar" vale para todas las acciones del bloque.
  // runWriteTool vuelve a chequear rol y permisos de cada una al ejecutar.
  const resultBlocks: Anthropic.ToolResultBlockParam[] = [];
  for (const item of pending.items) {
    if (decision === "decline") {
      resultBlocks.push({ type: "tool_result", tool_use_id: item.id, content: "El usuario canceló esta acción." });
    } else if (WRITE_TOOL_NAMES.has(item.name)) {
      const result = await runWriteTool(item.name, item.input);
      resultBlocks.push({ type: "tool_result", tool_use_id: item.id, content: result.message, is_error: !result.ok });
    } else {
      resultBlocks.push({ type: "tool_result", tool_use_id: item.id, content: await safeReadTool(item.name, item.input) });
    }
  }
  await persistRow(userId, "user", resultBlocks);

  const settings = await getBotSettings();
  if (settings.apiKeyConfigured) {
    // No toca el contador de preguntas — confirmar/cancelar es continuación
    // de la pregunta ya contada, no una pregunta nueva.
    await runConversationLoop(userId, "");
  }

  return currentHistory(userId);
}
