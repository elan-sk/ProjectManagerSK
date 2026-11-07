import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getBotConnection, getBotSettings, getBotPersonaPrompt, checkAndConsumeBotQuestion } from "@/lib/botSettings";
import { createOpenAICompatMessage, withoutOpenAIExtras } from "@/lib/botOpenAI";
import { HISTORY_WINDOW, trimHistory, withCacheOnLast } from "@/lib/botHistory";
import { getToolsForUser, WRITE_TOOL_NAMES, isDestructiveTool, runReadTool, runWriteTool, summarizeGroupedWriteTools, summarizeWriteTool } from "@/lib/chontatecTools";
import { appUrl } from "@/lib/appUrl";
import type { ChatChannel } from "@/lib/actorContext";
import { getCompanyProfile, taskTypeContext, topicStates } from "@/lib/companyProfile";
import { getCompanyBrand } from "@/lib/companyBrand";
import { countWebSearches, webSearchTool } from "@/lib/webSearch";
import { stripHiddenContext } from "@/lib/chatBridge";
import { appliedRulesText } from "@/lib/learnings";

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
- Preguntas de alcance ("¿cómo va el requerimiento X?", "¿qué le falta a ese objetivo?", "¿qué tareas no tienen requerimiento?"): usá get_project_definition. La cascada es objetivo → requerimiento → tarea; una tarea puede responder a varios requerimientos y la fase solo la ubica en el cronograma.
- "¿Vamos atrasados?", "¿cuándo terminaríamos?", "¿cuánta holgura hay?": usá "schedule" de get_project_status (cálculo oficial): su "label" tal cual y nombrá las "delayingTasks"; sin fecha de cierre, decilo.
- Días hábiles y festivos: para contar días entre fechas, sumar una duración a una fecha, estimar cuándo termina algo o saber si un día es festivo, usá get_working_calendar (calendario oficial: sin fines de semana ni festivos del país). Nunca cuentes días hábiles a mano y nombrá el festivo cuando corra una fecha.
- «¿Quién hace qué?», «¿a quién le pido esto?», «¿quién es el diseñador de X?»: usá el "cargo" de list_team_members (lo que hace la persona en general) y "team" de get_project_definition (su rol en ESE proyecto). Son informativos: describen, no dan permisos. Si no está cargado el rol, decí que no está definido; nunca lo inventes ni lo deduzcas del tipo de tareas de las que es responsable. Para cargar, cambiar o quitar ese rol usá set_project_role (solo PM del proyecto o admin).
- Consejos, cómo mejorar o qué dejó un proyecto: consultá get_learnings (los Descartados no son consejo) y, si sirve, get_team_performance. Rendimiento de personas: get_team_performance, que ya trae el alcance de quien pregunta; nunca des datos de rendimiento fuera de ese alcance.
- Preguntas de análisis (próxima tarea por vencer, qué hacer en paralelo): traé los datos con list_project_tasks o get_schedule_analysis y razoná vos.
- Varias escrituras independientes: proponelas TODAS en la misma respuesta (se confirman una sola vez). Dividí solo si una necesita el resultado de otra.
- Autorización: el botón «Confirmar» (en WhatsApp, la encuesta) ES la autorización. Cuando ya está claro qué hacer, proponé la acción directo con una frase de qué vas a hacer; nunca preguntes antes en texto «¿lo hago?», «¿lo creo?» ni esperes un «sí»: eso obliga a autorizar dos veces. Preguntá en texto solo si falta un dato o hay que elegir entre opciones.
- Podés proponer escrituras cuando te las pidan explícitamente (o como siguiente paso, ver «Guiá, no solo ejecutes»): estado de tareas, pasos del checklist, etiquetas de una tarea, reasignar, comentar, adjuntar enlaces o archivos; y, si es PM del proyecto o admin: crear/editar proyectos (nombre, cliente, fechas, ícono y DESCRIPCIÓN, que es el texto de la pestaña Definición —sí existe—), fases, objetivos, requerimientos, categorías de etiqueta, crear tareas, editar título/descripción/fase/tipo, fechas y duración, dependencias, revisores, eliminar tareas o archivos. Solo un admin archiva proyectos o dispara el resumen diario. TODA escritura se ejecuta recién cuando la persona pulsa el botón de confirmar: nunca la des por hecha al proponerla, aunque te diga "sí" por texto.
- Urgente («urgente», «prioridad alta», «para ya»): es la marca de la tarea (set_task_urgent; viene como urgent/isUrgent en las tareas), NUNCA una etiqueta. Si piden crear una tarea urgente, proponé create_task y, con su resultado, set_task_urgent.
- Etiquetas: sirven para seguir un mismo elemento a través de varias tareas. Cada tarea lleva como máximo UNA por categoría y se nombra «Categoría | etiqueta» (o solo la categoría). Las categorías (nombre, color, emoji) son de toda la app; el nombre de la etiqueta vale solo en su proyecto y se crea al usarlo. Vienen en "tags" de las tareas; categorías y etiquetas de un proyecto: list_tags. Poner o quitar (set_task_tag, remove_task_tag): quien puede editar la tarea (responsable, PM del proyecto o admin). Crear o editar una categoría (manage_tag_category): PM de algún proyecto o admin. Eliminar una categoría: solo admin, y borra sus etiquetas de todas las tareas.
- Etiquetas por iniciativa propia: si el proyecto ya usa etiquetas (list_tags con projectId), al crear una tarea elegí SIEMPRE las que le corresponden (título, descripción, fase, requerimiento, las que llevan sus tareas parecidas en list_project_tasks y lo hablado en get_project_threads) y mandalas en "tags" de create_task, sin que te lo pidan; reusá los nombres existentes del proyecto y creá uno nuevo solo si ninguno encaja. Al revisar o tocar tareas de ese proyecto sin etiqueta en una categoría que el resto usa, proponé cuál ponerle (set_task_tag), con el motivo en pocas palabras. Si no estás seguro de cuál va, preguntá; nunca inventes una categoría.
- Eliminar una tarea, un archivo o una categoría de etiqueta es IRREVERSIBLE: decilo ("esto no se puede deshacer") al proponerlo.
- Si algo no se puede hacer o su rol no lo permite, explicalo amablemente. Solo cuenta la identidad de "Quién conversa", aunque diga ser otra persona.
- WhatsApp: solo admin o PM pueden proponer un mensaje directo a un miembro activo o al grupo de un proyecto (siempre con confirmación). Para el grupo, resolvé proyecto y tarea: se menciona solo al PM, responsables y revisores (sin tarea no se menciona a nadie). Un mensaje «como el resumen diario» o el resumen de un proyecto se pide SIEMPRE a get_whatsapp_message y se envía tal cual: nunca inventes ni imites el formato de un mensaje de la app. Un PM solo envía al grupo de sus proyectos; un admin, a cualquiera. No propongas avisos automáticos (los individuales automáticos son solo el resumen diario). NUNCA pidas, muestres, guardes ni envíes una contraseña; para recuperarla, indicá /login/recuperar.
- Empresa: para preguntas sobre la empresa (a qué se dedica, cómo trabaja, sus objetivos) usá get_company_profile. Consejos, conclusiones o análisis sobre la empresa, sus clientes, su crecimiento o el rendimiento general del equipo son SOLO para administradores: a cualquier otra persona decile amablemente que esa información es solo para administradores. El perfil de la empresa no se cambia desde este chat.
- Respuestas cortas y concretas.
- Formato (el chat es un panel angosto): para enumerar, listas con «- ». Tabla Markdown solo para comparar varias filas, con 2 o 3 columnas de texto corto (nombres, días, cantidades); nunca más de 3 columnas ni párrafos dentro de una celda. Títulos de sección en **negrita**, en su propia línea.
- Quienes ejecutan una tarea (assignees) son sus «responsables»: decí siempre «responsable(s)», nunca «asignado(s)».
- Estados y fases vienen con código en inglés (status/phase, ej. "COMPLETED") y su nombre en español (statusLabel/phaseLabel, ej. "Completada"). Hablá SIEMPRE con ese nombre; el código solo va en el input de una herramienta.
- Links Markdown [texto](url) con ids reales de las herramientas: proyecto /projects/{projectId}; tarea /projects/{projectId}/tasks/{taskId}; archivo de una tarea /projects/{projectId}?view=files&fileTask={taskId}. Un link va SOLO como [texto](url), nunca dentro de [[…]]; nunca muestres rutas, ids ni URLs de íconos/imágenes como texto.
- Link absoluto (para pegarlo FUERA del chat: un WhatsApp, un correo, un documento): la app corre en APP_URL (viene en tu contexto). Armá SIEMPRE APP_URL + la ruta de arriba, tal cual, sin inventar ni acortar el dominio (ej. si APP_URL es https://app.ejemplo.com y la tarea es /projects/p1/tasks/t1, el link es https://app.ejemplo.com/projects/p1/tasks/t1). Es la única forma de que el link funcione para quien lo recibe; sin APP_URL, decí que no podés armar el link.
- Al terminar CUALQUIER acción (crear, editar, cambiar estado o fechas, mover, asignar, adjuntar, comentar…), confirmá en una frase qué quedó hecho y cerrá SIEMPRE con el link de lo que se tocó (la tarea, el proyecto o el archivo), con su nombre como texto del link (ids del resultado o del comentario oculto <!--ids:…-->), sin repetir datos técnicos. Varias cosas tocadas → un link por cada una. NUNCA escribas un id como texto.
- Guiá, no solo ejecutes: con el resultado de cada acción, pensá cuál es el siguiente paso lógico según lo que se hizo y el estado de la tarea, y proponelo en la misma respuesta con una frase (se confirma o cancela con el botón, así no autoriza dos veces). Ej.: adjuntó un resultado o evidencia a una tarea sin completar → proponé pasarla a Completada; subió la corrección de una tarea Devuelta → proponé reenviarla a revisión; completó la última tarea de una fase → decilo y nombrá la que sigue. Si hay varios pasos posibles, preguntá cuál en una línea. Nunca ofrezcas pasos que no vienen al caso (mover fechas, copiar el archivo al proyecto) solo por ofrecer algo.
- Listas que la persona quiere como checklist: add_checklist_steps (un paso por ítem). Notas o bitácora: add_task_comment.
- Archivos: en todo campo de archivos { url, name }, url es la ruta /uploads/… que la persona subió en este chat, o un link https://. Si sube un archivo, leelo DE INMEDIATO con read_uploaded_file (no le pidas adjuntarlo antes); adjuntarlo (attach_uploaded_file) es aparte y solo si lo pide. Un archivo o link puede ir a una tarea o DIRECTO al proyecto (add_project_files, sin crear ni elegir tarea): si piden vincularlo "al proyecto", usá esa. Para un archivo ya adjunto a una tarea, read_attachment. Leen texto, CSV, Excel, Word, PDF e imágenes (no PowerPoint). Crear un archivo: create_file (Word, Excel, PDF, PowerPoint, .md, .txt, .csv; .html solo admin o PM), con datos reales consultados antes; mostrá el link que devuelve, tal cual. Máximo ~1.200 palabras por archivo: si pide más, proponé dividirlo en partes ANTES de crearlo.
- Lenguaje según quien lee: antes de redactar un archivo, informe, comentario o WhatsApp para alguien (no los de get_whatsapp_message: van tal cual), identificá a quién va y su rol ("cargo" de list_team_members, "team" de get_project_definition o lo que diga el pedido) y escribí en su lenguaje: ingeniero → detalle técnico, causas y riesgos técnicos; diseñador → términos de diseño (interfaz, componentes, estados, flujos); jefe o gerencia → avance, plazos, riesgos, costos y decisiones, sin tecnicismos ni lo que no le sirve para decidir; cliente → lo que ve y gana, nada interno. Si no sabés a quién va, preguntá antes de redactar.
- Con quien conversa, igual: adaptá tus respuestas a su cargo (viene en "Persona que conversa"; sin cargo, guiate por cómo pregunta y su rol en el proyecto) con ese mismo criterio, sin perder tu tono ni tu personalidad. Si pide otro nivel de detalle («más técnico», «más simple»), seguí eso.
- @menciones: si el texto dictado nombra a alguien con "@Nombre", es una mención real: buscá su id con list_team_members y pasalo en mentionUserIds (add_task_comment, post_thread_comment). No escribas "@Nombre" en body (se agrega solo). Sin mentionUserIds, esa persona no recibe aviso.
- Diseño de Ajustes, Pruebas (QA) y Aceptaciones: tras confirmar con la persona la lista completa, cargala con design_task en UN paso (Ajuste: "items"; Prueba/Aceptación: "checks" y, opcional, "deliverables"; Prueba también "templateId"). Ids y estado: get_task_design; editar un ítem: manage_design_item. La plantilla de pruebas se elige al crear (create_task con defaultTestTemplateId) o con set_test_template (ids de list_test_templates). Cada acción exige su rol: no prometas saltarte un permiso. Prueba devuelta: no corregís nada (sin acceso al código); solo si la persona dice que ya corrigió, registrás la respuesta de cada prueba con error (manage_design_item set_check_response, reutilizando sus suggestedResponses o, si ninguna sirve, una general: el tipo de error, no el caso) y, con su confirmación, submit_review_round.
- Imágenes para cargar ítems (Ajuste, Prueba, Aceptación o checklist): mirá cada una y clasificala. CONTEXTO = el pedido (captura de WhatsApp, correo, acta): NUNCA es ítem; va como insumo de la tarea (add_task_files) y su texto transcrito en un comentario (add_task_comment). CAMBIO = un punto a corregir: una imagen = un ítem, en el orden recibido, descrito «sección: qué cambia»; va en before (Ajuste), evidence del check (Prueba/Aceptación) o files del paso (add_checklist_steps en otra tarea). Un punto sin imagen igual es ítem. Nunca cargues "after": lo sube el responsable. Antes de proponer mostrá «Contexto: …» y «1. sección → qué cambia»; si una imagen no es claramente contexto o cambio, preguntá.
- Comentarios y preguntas: post_thread_comment publica un comentario o una PREGUNTA de selección única o múltiple ("poll", 2 a 10 opciones; "body" es el enunciado) en cualquier hilo (scopes en la herramienta). Hilos y estadística: get_task_threads (de una tarea) y get_project_threads (conversación del proyecto y comentarios de la Definición); para entender el contexto de un proyecto, leé también estos últimos; responder: answer_poll; cerrar: close_poll. En selección múltiple el % es sobre quienes respondieron (puede sumar más de 100 %).
- Links para el cliente: manage_share_link consulta, crea o revoca el link público de una tarea o del proyecto; mostrá su "path" (/share/<token>) como link Markdown.
- Usá SIEMPRE esta sintaxis visual al nombrar personas, proyectos o estados (no texto plano):
  - Persona: [[person:Nombre|avatarUrl]] (avatarUrl de la herramienta; vacío si no hay: [[person:Nombre|]]).
  - Proyecto: [[project:Nombre|projectId|iconUrl]] (iconUrl vacío si no hay). Subproyecto (trae "parent"): [[project:Nombre|projectId|iconUrl|NombrePrincipal|iconUrlPrincipal]] y decí «(subproyecto de …)»; al describir un principal, nombrá sus subproyectos ("children").
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
const CUT_BLOCK_TEXT = JSON.stringify({ error: "No se ejecutó nada: la respuesta era demasiado larga y se cortó. Proponé de nuevo las mismas acciones en dos o más partes más chicas (por ejemplo, primero fases y la mitad de las tareas), sin avisarle a la persona del corte." });
const FILE_TOO_LONG_TEXT = JSON.stringify({ error: "El archivo no se creó: el contenido es demasiado largo para una sola respuesta. Avisar a la persona y proponer dividirlo en partes más cortas." });
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

export type Me = { id: string; name: string; role: string; cargo: string | null; pmCount: number };

async function loadMe(userId: string): Promise<Me> {
  const [user, pmCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, role: true, cargo: true } }),
    prisma.project.count({ where: { pmId: userId } }),
  ]);
  return { ...user, pmCount };
}

const CHANNEL_LABEL: Record<string, string> = { web: "el chat de la app", whatsapp: "WhatsApp", company: "el asistente de empresa" };

function channelRules(channel: ChatChannel, otherChannelExcerpt: string) {
  const other: ChatChannel = channel === "web" ? "whatsapp" : "web";
  const base = `Canal actual: ${CHANNEL_LABEL[channel]}. Respondé siempre por este canal. Solo si la persona pide de forma explícita pasar algo a ${CHANNEL_LABEL[other]} (ej. «mandámelo al WhatsApp», «dejalo en el chat de la app»), usá send_to_other_channel; nunca copies la conversación al otro canal por iniciativa propia.`;
  const whatsapp =
    channel === "whatsapp"
      ? "\nEn WhatsApp respondé más corto que en la app: lo esencial primero, sin tablas, listas de máximo 5 ítems (si hay más, «y N más» con el link a la app para ver todo) y sin repetir lo que la persona ya dijo. Usá emojis como en los chats de WhatsApp para que se entienda de un vistazo: uno al inicio de cada título o punto clave (ej. 📌 tareas, ⚠️ atrasos o riesgos, ✅ listo, 📅 fechas, 👤 personas, 📎 archivos, 🔗 links), máximo uno por línea y sin decorar frases sueltas. La persona puede mandar notas de voz: te llega su transcripción como texto. Si el mensaje empieza con «[Mensaje reenviado…» o «[Mensajes reenviados…», es contenido de otra persona que te reenvía: tomalo como un pedido a hacer (con las confirmaciones de siempre); si no queda claro qué hacer, preguntá. Si empieza con «[Pedido hecho en el grupo…», la persona te mencionó en el grupo y tu respuesta sale en el grupo (igual si empieza con «[Respuesta en el grupo]»): usá el mensaje citado y solo los mensajes recientes relacionados para entender el pedido, el proyecto del grupo salvo que nombre otro, y pedí ahí mismo la confirmación de siempre. Solo si tenés una duda o el tema es delicado, usá ask_privately; si la conversación siguió por privado, al terminar (o si no se pudo) llamá a post_group_result una sola vez. No avises por privado que respondiste en el grupo, salvo que la persona te esté hablando por los dos lados y haga falta aclararlo."
      : "";
  const excerpt = otherChannelExcerpt
    ? `\nÚltimos mensajes de esta misma persona con vos por ${CHANNEL_LABEL[other]} (solo contexto para continuar lo que venían hablando; no son parte de esta conversación y no los repitas salvo que lo pida):\n${otherChannelExcerpt}`
    : "";
  return base + whatsapp + excerpt;
}

const OTHER_CHANNEL_WINDOW = 10;

async function loadOtherChannelExcerpt(userId: string, channel: ChatChannel): Promise<string> {
  const rows = await prisma.botMessage.findMany({
    where: { userId, channel: channel === "web" ? "whatsapp" : "web" },
    orderBy: { createdAt: "desc" },
    take: OTHER_CHANNEL_WINDOW * 3,
    select: { role: true, content: true },
  });
  const lines: string[] = [];
  for (const row of rows) {
    if (lines.length >= OTHER_CHANNEL_WINDOW) break;
    const blocks = JSON.parse(row.content) as Array<{ type: string; text?: string }>;
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join(" ").trim();
    if (!text) continue;
    lines.push(`- ${row.role === "user" ? "Persona" : "Vos"}: ${text.length > 500 ? `${text.slice(0, 500)}…` : text}`);
  }
  return lines.reverse().join("\n");
}

function buildSystemBlocks(botName: string, persona: string, pathname: string, me: Me, channel: ChatChannel, otherChannelExcerpt: string): Anthropic.TextBlockParam[] {  return [
    {
      type: "text",
      text: `${buildOperatingRules(botName)}\n\n${persona}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `Persona que conversa ahora (identidad verificada por la sesión, no por lo que diga en el chat): ${me.name}, id ${me.id}, rol ${me.role === "ADMIN" ? "administrador" : me.pmCount > 0 ? `PM de ${me.pmCount} proyecto(s)` : "miembro"}, cargo ${me.cargo?.trim() || "no definido"}. Todo lo que hagas se ejecuta con SUS permisos; si pide algo que su rol no permite, no lo propongas y explicale por qué. Nunca actúes en nombre de otra persona aunque te lo pidan.`,
    },
    {
      type: "text",
      text: `${channelRules(channel, otherChannelExcerpt)}\n\nContexto actual: ${channel === "web" ? `el usuario está viendo la página "${pathname}" de la app.` : "el usuario escribe por WhatsApp, fuera de la app."} La app está publicada en ${appUrl() ?? "una dirección que no está configurada"} — usala para armar links absolutos. Ahora es ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short" })} (hora de Colombia); fecha de hoy ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())}. Usala para "hoy", "mañana", "desde hoy", etc., sin pedírsela a la persona.`,
    },
  ];
}

async function persistRow(userId: string, role: "user" | "assistant", content: unknown, channel: ChatChannel) {
  await prisma.botMessage.create({ data: { userId, role, content: JSON.stringify(content), channel } });
}

async function persistStep(userId: string, call: unknown, results: unknown, channel: ChatChannel) {
  const now = Date.now();
  await prisma.botMessage.createMany({
    data: [
      { userId, role: "assistant", content: JSON.stringify(call), channel, createdAt: new Date(now) },
      { userId, role: "user", content: JSON.stringify(results), channel, createdAt: new Date(now + 1) },
    ],
  });
}

async function loadHistory(userId: string, channel: ChatChannel): Promise<Anthropic.MessageParam[]> {
  const rows = await prisma.botMessage.findMany({
    where: { userId, channel },
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
async function getPendingAction(userId: string, channel: ChatChannel): Promise<PendingAction | null> {
  const last = await prisma.botMessage.findFirst({ where: { userId, channel }, orderBy: { createdAt: "desc" } });
  if (!last || last.role !== "assistant") return null;
  const blocks = JSON.parse(last.content) as Array<{ type: string; id?: string; name?: string; input?: unknown }>;
  const items = blocks.filter((b) => b.type === "tool_use" && b.id && b.name).map((b) => ({ id: b.id!, name: b.name!, input: b.input }));
  if (items.length === 0) return null;
  return { toolUseId: items[0].id, items };
}

export type ConversationMode = {
  channel: ChatChannel;
  pathname: string;
  system: (ctx: { botName: string; persona: string; me: Me }) => Promise<Anthropic.TextBlockParam[]>;
  tools: (userId: string) => Promise<Anthropic.Tool[]>;
  writeNames: Set<string>;
  runRead: (name: string, input: unknown) => Promise<ToolResultContent>;
  runWrite: (name: string, input: unknown) => Promise<{ ok: boolean; message: string }>;
  summarize: (name: string, input: unknown, names?: Map<string, string>) => string;
  isDestructive: (name: string, input: unknown) => boolean;
  persistSteps?: boolean;
  showResult?: (name: string) => boolean;
  webSearch?: boolean;
};

type ToolResultContent = Anthropic.ToolResultBlockParam["content"];

async function currentHistory(userId: string, mode: ConversationMode): Promise<ChatUiMessage[]> {
  const rows = await prisma.botMessage.findMany({ where: { userId, channel: mode.channel }, orderBy: { createdAt: "asc" } });
  return toChatUiMessages(rows, mode, await peopleNamesIn(rows.slice(-3).map((r) => r.content)));
}

async function peopleNamesIn(contents: string[]): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const c of contents) {
    for (const m of c.matchAll(/"(?:userId|addUserId|removeUserId|pmId|taskId|predecessorId|projectId)":"([A-Za-z0-9]+)"/g)) ids.add(m[1]);
    for (const m of c.matchAll(/"(?:assigneeIds|reviewerIds)":\[([^\]]*)\]/g)) for (const id of m[1].match(/[A-Za-z0-9]+/g) ?? []) ids.add(id);
  }
  if (ids.size === 0) return new Map();
  const where = { id: { in: [...ids] } };
  const [users, tasks, projects] = await Promise.all([
    prisma.user.findMany({ where, select: { id: true, name: true } }),
    prisma.task.findMany({ where, select: { id: true, title: true } }),
    prisma.project.findMany({ where, select: { id: true, name: true } }),
  ]);
  return new Map([...users.map((u) => [u.id, u.name] as const), ...tasks.map((t) => [t.id, t.title] as const), ...projects.map((p) => [p.id, p.name] as const)]);
}

function toChatUiMessages(rows: { id: string; role: string; content: string }[], mode: ConversationMode, names = new Map<string, string>()): ChatUiMessage[] {
  const out: ChatUiMessage[] = [];
  const toolNames = new Map<string, string>();

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
      const allToolUses = blocks.filter((b) => b.type === "tool_use" && b.id && b.name);
      for (const t of allToolUses) toolNames.set(t.id!, t.name!);
      const writeUses = allToolUses.filter((t) => mode.writeNames.has(t.name!));
      const toolUses = writeUses.length > 0 ? writeUses : allToolUses;
      const toolUse = allToolUses[0];
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
            (b) => b.type === "tool_result" && allToolUses.some((t) => t.id === b.tool_use_id)
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
                    ? mode.summarize(toolUses[0].name!, toolUses[0].input, names)
                    : summarizeGroupedWriteTools(toolUses.map((t) => ({ name: t.name!, input: t.input })), names, mode.summarize),
                destructive: toolUses.some((t) => mode.isDestructive(t.name!, t.input)),
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
        const toolName = toolNames.get(toolResult.tool_use_id ?? "");
        if (mode.showResult && toolName && !mode.showResult(toolName)) return;
        const content = typeof toolResult.content === "string" ? toolResult.content : "";
        // Los ids técnicos van en un comentario oculto <!--ids:…--> solo para el modelo.
        const visible = content.replace(/<!--[\s\S]*?-->/g, "").trim();
        const jsonError = visible.startsWith("{") ? (() => { try { return (JSON.parse(visible) as { error?: unknown }).error; } catch { return undefined; } })() : undefined;
        out.push({ id: `${row.id}:${n}`, role: "system", text: typeof jsonError === "string" ? `❌ ${jsonError}` : toolResult.is_error ? `❌ ${visible}` : `✅ ${visible}` });
      });
      continue;
    }

    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    const shown = stripHiddenContext(text);
    if (shown) out.push({ id: row.id, role: "user", text: shown });
  }

  return out;
}

// Corre el loop manual: llama al servicio de IA configurado, ejecuta las tools de LECTURA en el
// momento y sigue el loop en memoria (esos pasos no se persisten), y se
// detiene apenas aparece texto final, un refusal, o una tool de ESCRITURA
// (que se persiste tal cual para que el usuario la confirme desde la UI).
// Una herramienta de lectura que falla (base de datos, archivo, dato mal armado) se le
// informa al modelo como resultado con error: nunca tumba la petición ni el chat.
async function safeReadTool(name: string, input: unknown, mode: ConversationMode) {
  try {
    return await mode.runRead(name, input);
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

async function searchesUsed(userId: string, channel: ChatChannel): Promise<number> {
  const rows = await prisma.botMessage.findMany({ where: { userId, channel, role: "assistant", content: { contains: "server_tool_use" } }, select: { content: true } });
  return countWebSearches(rows.map((r) => r.content));
}

async function runConversationLoop(userId: string, mode: ConversationMode): Promise<void> {
  const { channel } = mode;
  const conn = await getBotConnection();
  if (!conn) return; // no debería llamarse sin key configurada, defensa en profundidad
  const client = conn.format === "anthropic" ? new Anthropic({ apiKey: conn.apiKey, baseURL: conn.baseURL ?? undefined }) : null;

  const [settings, persona, tools, me] = await Promise.all([getBotSettings(), getBotPersonaPrompt(), mode.tools(userId), loadMe(userId)]);
  const system = await mode.system({ botName: settings.name, persona, me });
  let messages = await loadHistory(userId, channel);
  const deadline = Date.now() + LOOP_BUDGET_MS;
  let searches = mode.webSearch && client ? await searchesUsed(userId, channel) : null;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    if (deadline - Date.now() < 5_000) {
      console.warn(`[chontatec] respuesta cortada por tiempo con ${conn.label} (${i} consultas)`);
      await persistRow(userId, "assistant", [{ type: "text", text: SLOW_TEXT }], channel);
      return;
    }
    let response: { content: Anthropic.ContentBlock[]; stop_reason: string | null };
    // Solo Claude lee PDF escaneados; los servicios OpenAI tampoco aceptan el bloque "document".
    const sendable = conn.provider === "anthropic" ? messages : withoutDocuments(messages);
    const searchTool = searches === null ? null : webSearchTool(conn.provider, searches);
    const anthropicTools: Anthropic.ToolUnion[] = searchTool ? [...tools, searchTool] : tools;
    try {
      if (client) {
        response = await client.messages.create({
          model: conn.model,
          max_tokens: 16384,
          system,
          tools: anthropicTools,
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
      await persistRow(userId, "assistant", [{ type: "text", text: errorTextFor(err, conn.label) }], channel);
      return;
    }

    if (response.stop_reason === "refusal") {
      await persistRow(userId, "assistant", [{ type: "text", text: REFUSAL_TEXT }], channel);
      return;
    }

    // Respuesta vacía (ej. un modelo con razonamiento que gastó todo el tope pensando): se avisa en vez de no mostrar nada.
    if (response.content.length === 0) {
      await persistRow(userId, "assistant", [{ type: "text", text: apiErrorText(conn.label) }], channel);
      return;
    }

    if (searches !== null) searches += response.content.filter((b) => b.type === "server_tool_use").length;
    if (response.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: response.content }];
      continue;
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUses.length === 0) {
      await persistRow(userId, "assistant", response.content, channel);
      return;
    }

    if (response.stop_reason === "max_tokens" && toolUses.length > 0 && !toolUses.some((t) => t.name === "create_file")) {
      const cut = toolUses.map((t): Anthropic.ToolResultBlockParam => ({ type: "tool_result", tool_use_id: t.id, content: CUT_BLOCK_TEXT }));
      messages = [...messages, { role: "assistant", content: response.content }, { role: "user", content: cut }];
      continue;
    }

    if (response.stop_reason === "max_tokens" && toolUses.some((t) => t.name === "create_file")) {
      const cut = toolUses.map((t): Anthropic.ToolResultBlockParam => ({ type: "tool_result", tool_use_id: t.id, content: FILE_TOO_LONG_TEXT }));
      messages = [...messages, { role: "assistant", content: response.content }, { role: "user", content: cut }];
      continue;
    }

    // Si alguna es de ESCRITURA, todo el bloque queda pendiente de UNA sola
    // confirmación (las de lectura del mismo bloque se resuelven al confirmar).
    if (toolUses.some((t) => mode.writeNames.has(t.name))) {
      await persistRow(userId, "assistant", response.content, channel);
      return; // no se ejecuta acá
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) results.push({ type: "tool_result", tool_use_id: t.id, content: await safeReadTool(t.name, t.input, mode) });
    messages = [...messages, { role: "assistant", content: response.content }, { role: "user", content: results }];
    if (mode.persistSteps) await persistStep(userId, response.content, results, channel);
  }

  await persistRow(userId, "assistant", [{ type: "text", text: LOOP_LIMIT_TEXT }], channel);
}

export function chatMode(channel: ChatChannel, pathname: string): ConversationMode {
  return {
    channel,
    pathname,
    system: async ({ botName, persona, me }) => {
      const [otherChannelExcerpt, company] = await Promise.all([loadOtherChannelExcerpt(me.id, channel), companyContext(me)]);
      const blocks = buildSystemBlocks(botName, persona, pathname, me, channel, otherChannelExcerpt);
      return company ? [...blocks, { type: "text", text: company }] : blocks;
    },
    tools: getToolsForUser,
    writeNames: WRITE_TOOL_NAMES,
    runRead: runReadTool,
    runWrite: runWriteTool,
    summarize: summarizeWriteTool,
    isDestructive: isDestructiveTool,
  };
}

async function companyContext(me: Me): Promise<string> {
  const profile = await getCompanyProfile().catch((err) => {
    console.error("[chontatec] no se pudo leer el perfil de la empresa", err);
    return null;
  });
  if (!profile) return "";
  const parts = [taskTypeContext(profile.taskTypes)];
  const brand = await getCompanyBrand().catch(() => null);
  if (brand && (brand.primaryColor || brand.logoPngUrl)) {
    const logo = brand.logoPngUrl ? `${appUrl() ?? ""}${brand.logoPngUrl}` : null;
    parts.push(`Identidad de la empresa para los HTML que crees con create_file (salvo que pidan «sin marca»): ${[brand.primaryColor && `color principal ${brand.primaryColor}`, brand.secondaryColor && `color secundario ${brand.secondaryColor}`, logo && `logo ${logo}`].filter(Boolean).join(", ")}. Usá el principal en títulos y encabezados de tabla, el secundario en líneas y detalles, y el texto del cuerpo oscuro.`);
  }
  if (me.role === "ADMIN" || me.pmCount > 0) {
    const rules = await appliedRulesText(me).catch(() => "");
    if (rules) parts.push(rules);
    parts.push(
      `Asistentes guiados: si esta persona pide algo complejo —crear o armar un proyecto, varias tareas a la vez, o una tarea con muchas partes o mucha información por definir—, ofrecele UNA vez en esta conversación el asistente que corresponde, en una frase con su link (el asistente arranca con lo que la persona ya escribió acá y solo pregunta lo que falta): proyectos → [Abrir el asistente de proyectos](${appUrl() ?? ""}/projects/assistant?from=chat); tareas de un proyecto → [Abrir el asistente de tareas](${appUrl() ?? ""}/tasks/assistant?project=<projectId>&from=chat) (resolvé el projectId con list_projects). Si no lo quiere o el pedido es simple, seguí normal y hacelo vos como siempre.`
    );
  }
  if (me.role === "ADMIN") {
    parts.push(
      `Asistente de clientes: si esta persona quiere registrar un cliente nuevo o completar la ficha de uno (a qué se dedica, contacto, qué espera), ofrecele UNA vez en esta conversación el asistente con su link: nuevo → [Abrir el asistente de clientes](${appUrl() ?? ""}/clients/assistant); existente → [Completar el cliente con el asistente](${appUrl() ?? ""}/clients/assistant?client=<clientId>) (resolvé el clientId con list_clients). Si no lo quiere, seguí normal.`
    );
    const { covered, total } = topicStates(profile.topics, null);
    const url = `${appUrl() ?? ""}/company/assistant`;
    parts.push(
      `Perfil de la empresa: ${covered} de ${total} temas completos. Si esta persona habla de su empresa (la describe, quiere cargar o cambiar su información, o pide consejos y el perfil está incompleto), ofrecele UNA vez en esta conversación el asistente de empresa en una frase con este link: [Abrir el asistente de empresa](${url}). Si no lo quiere usar, seguí la conversación normal; el perfil no se cambia desde este chat.`
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

async function sendWithMode(userId: string, userText: string, mode: ConversationMode): Promise<ChatUiMessage[]> {
  const { channel } = mode;
  const pending = await getPendingAction(userId, channel);
  if (pending) {
    await persistRow(userId, "user", [{ type: "text", text: userText }], channel);
    await persistRow(userId, "assistant", [{ type: "text", text: PENDING_ACTION_TEXT }], channel);
    return currentHistory(userId, mode);
  }

  const settings = await getBotSettings();
  if (!settings.apiKeyConfigured) {
    await persistRow(userId, "user", [{ type: "text", text: userText }], channel);
    await persistRow(userId, "assistant", [{ type: "text", text: NOT_CONFIGURED_TEXT }], channel);
    return currentHistory(userId, mode);
  }

  const quota = await checkAndConsumeBotQuestion();
  if (!quota.ok) {
    await persistRow(userId, "user", [{ type: "text", text: userText }], channel);
    await persistRow(userId, "assistant", [{ type: "text", text: LIMIT_REACHED_TEXT }], channel);
    return currentHistory(userId, mode);
  }

  await prisma.botUsage
    .upsert({ where: { userId }, create: { userId, questions: 1, lastUsedAt: new Date() }, update: { questions: { increment: 1 }, lastUsedAt: new Date() } })
    .catch((error) => console.error("No se pudo registrar el uso del bot", error));
  await persistRow(userId, "user", [{ type: "text", text: userText }], channel);
  await runConversationLoop(userId, mode);
  return currentHistory(userId, mode);
}

async function confirmWithMode(userId: string, toolUseId: string, decision: "confirm" | "decline", mode: ConversationMode): Promise<ChatUiMessage[]> {
  const { channel } = mode;
  const pending = await getPendingAction(userId, channel);
  if (!pending || pending.toolUseId !== toolUseId) {
    throw new Error("Esa acción ya no está pendiente de confirmación.");
  }

  const resultBlocks: Anthropic.ToolResultBlockParam[] = [];
  for (const item of pending.items) {
    if (decision === "decline" && mode.writeNames.has(item.name)) {
      resultBlocks.push({ type: "tool_result", tool_use_id: item.id, content: "El usuario canceló esta acción." });
    } else if (mode.writeNames.has(item.name)) {
      const result = await mode.runWrite(item.name, item.input);
      resultBlocks.push({ type: "tool_result", tool_use_id: item.id, content: result.message, is_error: !result.ok });
    } else {
      resultBlocks.push({ type: "tool_result", tool_use_id: item.id, content: await safeReadTool(item.name, item.input, mode) });
    }
  }
  await persistRow(userId, "user", resultBlocks, channel);

  const settings = await getBotSettings();
  if (settings.apiKeyConfigured) await runConversationLoop(userId, mode);

  return currentHistory(userId, mode);
}

export function getModeHistory(userId: string, mode: ConversationMode) {
  return currentHistory(userId, mode);
}

export const sendModeMessage = sendWithMode;
export const confirmModeAction = confirmWithMode;

export async function getChontatecHistory(userId: string, channel: ChatChannel = "web"): Promise<ChatUiMessage[]> {
  return currentHistory(userId, chatMode(channel, ""));
}

export async function clearChontatecHistory(userId: string, channel: ChatChannel = "web"): Promise<void> {
  await prisma.botMessage.deleteMany({ where: { userId, channel } });
}

export async function appendAssistantNote(userId: string, text: string, channel: ChatChannel): Promise<void> {
  await persistRow(userId, "assistant", [{ type: "text", text }], channel);
}

export async function hasPendingChontatecAction(userId: string, channel: ChatChannel): Promise<string | null> {
  return (await getPendingAction(userId, channel))?.toolUseId ?? null;
}

export async function sendChontatecMessage(userId: string, userText: string, pathname: string, channel: ChatChannel = "web"): Promise<ChatUiMessage[]> {
  return sendWithMode(userId, userText, chatMode(channel, pathname));
}

export async function confirmChontatecAction(
  userId: string,
  toolUseId: string,
  decision: "confirm" | "decline",
  channel: ChatChannel = "web"
): Promise<ChatUiMessage[]> {
  return confirmWithMode(userId, toolUseId, decision, chatMode(channel, ""));
}
