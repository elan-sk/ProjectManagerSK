import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/appUrl";
import { READ_TOOLS, runReadTool } from "@/lib/chontatecTools";
import { READ_WEB_PAGE_TOOL, runReadWebPage, webResearchRules } from "@/lib/assistantWebTools";
import type { ConversationMode } from "@/lib/chontatec";
import { TASK_TYPE_LABEL } from "@/lib/statusColors";
import { mimeFromFileName } from "@/lib/uploadLimits";
import { BRAND_FIELD_LABEL, getCompanyBrand, saveCompanyBrand } from "@/lib/companyBrand";
import {
  COMPANY_NAME_KEY,
  COMPANY_TOPICS,
  COMPANY_TOPIC_KEYS,
  TASK_TYPES,
  addCompanyDocument,
  getCompanyProfile,
  nextPendingTopic,
  saveCompanyTopic,
  saveTaskTypeMeanings,
  setCompanyFocus,
  skipCompanyTopic,
  topicStates,
  type CompanyProfile,
} from "@/lib/companyProfile";

const TOPIC_LABEL: Record<string, string> = Object.fromEntries([[COMPANY_NAME_KEY, "Nombre de la empresa"], ...COMPANY_TOPICS.map((t) => [t.key, t.label])]);
const TOPIC_ENUM = [COMPANY_NAME_KEY, ...COMPANY_TOPIC_KEYS];

const TYPE_HELP = "Simple (tarea común de una persona), Entregable (hito que se cierra con una evidencia), Prueba (revisión interna con lista de pruebas por rondas), Ajuste (lista de cambios pedidos, con antes y después), Aceptación (el cliente acepta o devuelve cada característica desde un link)";

const TOOLS: Anthropic.Tool[] = [
  {
    name: "focus_company_topic",
    description: "Marca el tema que estás preguntando ahora (se ve resaltado en la lista de temas). Llamala cada vez que pasás a un tema.",
    input_schema: { type: "object", properties: { topic: { type: "string", enum: TOPIC_ENUM } }, required: ["topic"] },
  },
  {
    name: "company_topic",
    description: "Guarda el texto de un tema del perfil (action save, reemplaza el texto anterior completo) o lo deja pendiente porque la persona pidió saltarlo (action skip).",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", enum: TOPIC_ENUM },
        action: { type: "string", enum: ["save", "skip"] },
        text: { type: "string", description: "Texto final del tema (solo save), en tercera persona y sin inventar nada. Para name, solo el nombre, sin frase." },
      },
      required: ["topic", "action"],
    },
  },
  {
    name: "add_company_document",
    description: "Guarda en «Documentos de la empresa» un archivo que la persona subió en esta conversación.",
    input_schema: {
      type: "object",
      properties: { fileUrl: { type: "string", description: "Ruta /uploads/… del archivo." }, fileName: { type: "string" } },
      required: ["fileUrl", "fileName"],
    },
  },
  {
    name: "save_company_brand",
    description:
      "Guarda la identidad de la empresa para los documentos: logo e ícono (ruta /uploads/… de una imagen que la persona subió en esta conversación), colores en #RRGGBB y datos (razón social, NIT, dirección, ciudad, teléfono, correo, sitio web). Mandá solo los campos que tengas.",
    input_schema: {
      type: "object",
      properties: {
        logoUrl: { type: "string" },
        iconUrl: { type: "string" },
        primaryColor: { type: "string" },
        secondaryColor: { type: "string" },
        legalName: { type: "string" },
        taxId: { type: "string" },
        address: { type: "string" },
        city: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        website: { type: "string" },
      },
    },
  },
  {
    name: "propose_task_type_meanings",
    description: `Propone qué significa cada tipo de tarea de la app en esta empresa: ${TYPE_HELP}. Se guarda recién cuando la persona confirma.`,
    input_schema: {
      type: "object",
      properties: {
        meanings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: TASK_TYPES },
              meaning: { type: "string", description: "Qué es ese tipo en esta empresa, en una frase." },
              unused: { type: "boolean", description: "true si la empresa no lo usa." },
            },
            required: ["type"],
          },
        },
      },
      required: ["meanings"],
    },
  },
];

const WRITE_NAMES = new Set(["propose_task_type_meanings"]);
const BRAND_LABELS: Record<string, string> = { ...BRAND_FIELD_LABEL, logoUrl: "logo", iconUrl: "ícono", primaryColor: "color principal", secondaryColor: "color secundario" };
const VISIBLE_RESULTS = new Set(["company_topic", "add_company_document", "propose_task_type_meanings", "save_company_brand"]);

async function requireAdminId(): Promise<string> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Solo un administrador puede cambiar el perfil de la empresa.");
  return session.user.id;
}

function rules(botName: string) {
  const topics = COMPANY_TOPICS.map((t, i) => `${i + 1}. ${t.label} (${t.key})`).join("\n");
  return `Sos ${botName}, en modo asistente de empresa de ProjectManagerSK. Conversás con un administrador para armar el perfil de su empresa; después ese perfil orienta los consejos y conclusiones que la IA le da a la empresa.

Primero el nombre de la empresa (${COMPANY_NAME_KEY}). Después los temas, en este orden:
${topics}

Reglas:
- Una sola pregunta por mensaje, corta y amable. Antes de cada pregunta, una frase con lo que entendiste de la respuesta anterior (feedback).
- Cada vez que pasás a un tema, llamá focus_company_topic.
- El nombre de la empresa (name) se guarda SOLO como el nombre, tal cual lo escribe la persona (ej. «Elan-sk»), nunca como frase.
- Cuando un tema quedó cubierto, redactá su texto claro, en tercera persona, con **negrita** en las palabras o frases clave (pocas, nunca párrafos enteros), sin inventar nada que no te hayan dicho o que no esté en sus archivos, y guardalo con company_topic (save). Si una respuesta cubre varios temas, guardalos todos. Si la respuesta es corta o ambigua, repreguntá antes de guardar.
- Si la persona dice «después», «no sé», «saltar» o parecido, company_topic (skip) y seguí con el siguiente pendiente.
- Perfil vacío: saludá en una frase y preguntá el nombre de la empresa.
- Perfil con información (repaso): en cada tema mostrá en pocas líneas lo guardado y preguntá si agrega algo, lo cambia o lo deja así. Si agrega o cambia, reescribí el tema completo y guardalo.
- «Cómo trabaja»: preguntá por sus procesos (etapas de un trabajo, quién revisa, cómo se entrega al cliente, cómo se manejan los cambios). Guardá el texto (y lo que haya que saltar) y, DESPUÉS, en un mensaje aparte donde propose_task_type_meanings sea la única herramienta, proponé con ella qué significa en la empresa cada tipo de tarea de la app: ${TYPE_HELP}. Marcá unused los que no encajen con sus procesos. Explicá la propuesta en pocas líneas: se guarda solo si la persona la confirma con el botón.
- «Qué quiere revisar con la aplicación» y «Consejos que espera»: son lo más importante; preguntá con ejemplos (cuánto duran los proyectos, mejorar procesos, conseguir más clientes, rendimiento del equipo) y repreguntá hasta que quede claro qué quiere lograr.
- Archivos: si sube uno, leelo DE INMEDIATO con read_uploaded_file, guardalo con add_company_document y usá su contenido para los temas que cubra.
- Identidad para los documentos (logo, ícono, color principal y secundario, razón social, NIT, dirección, ciudad, teléfono, correo, sitio web): cuando los temas estén cubiertos, o antes si la persona sube un logo o un manual de marca, pedila. Si sube una imagen de logo o ícono, guardala con save_company_brand. De un manual de marca, sacá los colores (#RRGGBB) y los datos que tenga y guardalos con save_company_brand; decí en pocas líneas qué guardaste para que lo pueda corregir. Nunca inventes un color ni un dato.
- Cuando los ${COMPANY_TOPICS.length} temas y la identidad estén cubiertos, decilo y ofrecé terminar o seguir agregando información.
- Solo el perfil de la empresa: si pide algo de proyectos, tareas u otras acciones, decile que eso va en el chat normal.
- Usá **negrita** para enfatizar lo clave de cada mensaje: el nombre de la empresa, el tema que estás preguntando y los datos importantes que entendiste (ej. «Melo, entonces **Elan-sk** está en el sector de **desarrollo de páginas web**. ¿Y **qué hace** exactamente?»). Solo palabras o frases cortas, nunca párrafos enteros.
- Respuestas cortas. Nunca muestres ids, claves de tema ni rutas.`;
}

function snapshot(profile: CompanyProfile, brand: Awaited<ReturnType<typeof getCompanyBrand>>) {
  const { items, covered, total } = topicStates(profile.topics, profile.focus);
  const lines = items.map((i) => `- ${i.label} (${i.key}): ${i.text ?? (i.skipped ? "(saltado)" : "(pendiente)")}`);
  const types = profile.taskTypes.map((m) => `- ${TASK_TYPE_LABEL[m.type]}: ${m.unused ? "No se usa" : m.meaning ?? "(sin definir)"}`);
  const docs = profile.documents.map((d) => `- ${d.name}`);
  return `Estado actual del perfil (${covered} de ${total} temas):
Nombre de la empresa: ${profile.name ?? "(pendiente)"}
${lines.join("\n")}
Tema en curso: ${profile.focus ? TOPIC_LABEL[profile.focus] : "(ninguno)"}
Tipos de tarea en esta empresa:
${types.join("\n")}
Documentos de la empresa: ${docs.length ? `\n${docs.join("\n")}` : "(ninguno)"}
Identidad: logo ${brand?.logoPngUrl ? "cargado" : "(pendiente)"}, ícono ${brand?.iconPngUrl ? "cargado" : "(pendiente)"}, color principal ${brand?.primaryColor ?? "(pendiente)"}, color secundario ${brand?.secondaryColor ?? "(pendiente)"}, ${Object.entries(BRAND_FIELD_LABEL).map(([k, label]) => `${label}: ${brand?.[k as keyof typeof BRAND_FIELD_LABEL] ?? "(pendiente)"}`).join(", ")}
Fecha de hoy: ${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())}. App: ${appUrl() ?? "(sin dirección)"}.`;
}

async function runRead(name: string, input: unknown): Promise<Anthropic.ToolResultBlockParam["content"]> {
  if (name === "read_uploaded_file") return runReadTool(name, input);
  if (name === "read_web_page") return runReadWebPage(input);
  const userId = await requireAdminId().catch((err: Error) => err);
  if (userId instanceof Error) return JSON.stringify({ error: userId.message });

  switch (name) {
    case "focus_company_topic": {
      const { topic } = z.object({ topic: z.enum(TOPIC_ENUM as [string, ...string[]]) }).parse(input);
      await setCompanyFocus(topic);
      return "Listo.";
    }
    case "company_topic": {
      const { topic, action, text } = z
        .object({ topic: z.enum(TOPIC_ENUM as [string, ...string[]]), action: z.enum(["save", "skip"]), text: z.string().max(20000).optional() })
        .parse(input);
      if (action === "save") {
        if (!text?.trim()) return JSON.stringify({ error: "Falta el texto del tema." });
        await saveCompanyTopic(topic, text, userId);
        return `Guardado en «${TOPIC_LABEL[topic]}»`;
      }
      if (topic === COMPANY_NAME_KEY) return "El nombre queda pendiente";
      await skipCompanyTopic(topic as (typeof COMPANY_TOPIC_KEYS)[number], userId);
      const profile = await getCompanyProfile();
      await setCompanyFocus(nextPendingTopic(profile.topics, topic));
      return `«${TOPIC_LABEL[topic]}» queda pendiente`;
    }
    case "save_company_brand": {
      const fields = z
        .object({
          logoUrl: z.string().regex(/^\/uploads\/[A-Za-z0-9._-]+$/).optional(),
          iconUrl: z.string().regex(/^\/uploads\/[A-Za-z0-9._-]+$/).optional(),
          primaryColor: z.string().max(9).optional(),
          secondaryColor: z.string().max(9).optional(),
          legalName: z.string().max(190).optional(),
          taxId: z.string().max(190).optional(),
          address: z.string().max(190).optional(),
          city: z.string().max(190).optional(),
          phone: z.string().max(190).optional(),
          email: z.string().max(190).optional(),
          website: z.string().max(190).optional(),
        })
        .safeParse(input);
      if (!fields.success) return JSON.stringify({ error: "Algún dato de la identidad llegó mal (las imágenes tienen que ser archivos subidos en esta conversación)." });
      const images = [fields.data.logoUrl, fields.data.iconUrl].filter(Boolean) as string[];
      if (images.length > 0) {
        const own = await prisma.botMessage.findMany({ where: { userId, role: "user" }, orderBy: { createdAt: "desc" }, take: 300, select: { content: true } });
        if (images.some((url) => !own.some((m) => m.content.includes(url)))) return JSON.stringify({ error: "Esa imagen no fue subida en esta conversación." });
      }
      const result = await saveCompanyBrand(fields.data);
      if (!result.ok) return JSON.stringify({ error: result.error });
      const labels = Object.keys(fields.data).map((k) => BRAND_LABELS[k] ?? k);
      return `Identidad guardada: ${labels.join(", ")}`;
    }
    case "add_company_document": {
      const { fileUrl, fileName } = z.object({ fileUrl: z.string().regex(/^\/uploads\/[A-Za-z0-9._-]+$/), fileName: z.string().trim().min(1).max(255) }).parse(input);
      const ownMessages = await prisma.botMessage.findMany({ where: { userId, role: "user" }, orderBy: { createdAt: "desc" }, take: 300, select: { content: true } });
      if (!ownMessages.some((m) => m.content.includes(fileUrl))) return JSON.stringify({ error: "Ese archivo no fue subido en esta conversación." });
      await addCompanyDocument({ url: fileUrl, name: fileName, mimeType: mimeFromFileName(fileName) ?? "application/octet-stream" }, userId);
      return `Documento guardado: ${fileName}`;
    }
    default:
      return JSON.stringify({ error: "Esa herramienta no está disponible en el asistente de empresa." });
  }
}

const meaningsSchema = z.object({
  meanings: z.array(z.object({ type: z.enum(TASK_TYPES as [string, ...string[]]), meaning: z.string().max(1000).nullish(), unused: z.boolean().nullish() })).min(1),
});

async function runWrite(name: string, input: unknown) {
  if (name !== "propose_task_type_meanings") return { ok: false, message: "Acción no disponible." };
  try {
    await requireAdminId();
    const { meanings } = meaningsSchema.parse(input);
    await saveTaskTypeMeanings(meanings.map((m) => ({ type: m.type as (typeof TASK_TYPES)[number], meaning: m.meaning ?? null, unused: Boolean(m.unused) })));
    return { ok: true, message: "Guardado: qué significa cada tipo de tarea en la empresa" };
  } catch (err) {
    console.error("[asistente de empresa] no se pudieron guardar los tipos de tarea", err);
    return { ok: false, message: err instanceof z.ZodError ? "La propuesta llegó incompleta; pedirla de nuevo." : (err as Error).message };
  }
}

function summarize(name: string, input: unknown) {
  if (name !== "propose_task_type_meanings") return "Acción del asistente";
  const parsed = meaningsSchema.safeParse(input);
  if (!parsed.success) return "Guardar qué significa cada tipo de tarea en la empresa";
  const lines = parsed.data.meanings.map((m) => `• ${TASK_TYPE_LABEL[m.type]}: ${m.unused ? "No se usa" : m.meaning ?? ""}`);
  return `Guardar qué significa cada tipo de tarea en la empresa:\n${lines.join("\n")}`;
}

export function companyAssistantMode(): ConversationMode {
  const uploadTool = READ_TOOLS.find((t) => t.name === "read_uploaded_file");
  return {
    channel: "company",
    pathname: "/company/assistant",
    system: async ({ botName, persona }) => [
      { type: "text", text: `${rules(botName)}\n\n${await webResearchRules("la empresa propia y su sector")}\n\n${persona}`, cache_control: { type: "ephemeral" } },
      { type: "text", text: snapshot(...(await Promise.all([getCompanyProfile(), getCompanyBrand()]))) },
    ],
    tools: async () => [...TOOLS, READ_WEB_PAGE_TOOL, ...(uploadTool ? [uploadTool] : [])],
    writeNames: WRITE_NAMES,
    runRead,
    runWrite,
    summarize,
    isDestructive: () => false,
    persistSteps: true,
    showResult: (n) => VISIBLE_RESULTS.has(n),
    webSearch: true,
  };
}
