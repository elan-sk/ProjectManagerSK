import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { APP_SETTING_ID } from "@/lib/appSettings";
import { decryptPassword, encryptPassword } from "@/lib/credentialCrypto";
import { templateParam } from "@/lib/whatsappCloudFormat";
import { recordWhatsAppSent } from "@/lib/whatsappUsage";

export const GRAPH_VERSION = "v24.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type WhatsAppConnection = "qr" | "cloud";

export type CloudConfig = {
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  templateName: string | null;
  templateLang: string;
};

export class CloudError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
  }
}

const ERROR_TEXT: Record<number, string> = {
  190: "El token de acceso no es válido o venció.",
  10: "El token no tiene permiso para usar este número.",
  100: "Meta rechazó los datos del mensaje o el identificador del número no es correcto.",
  131030: "Ese número no está en la lista de números autorizados del número de prueba de Meta.",
  131047: "Pasaron más de 24 horas desde el último mensaje de la persona y no se pudo usar la plantilla.",
  131026: "El mensaje no se pudo entregar a ese número.",
  132000: "La cantidad de datos no coincide con la plantilla aprobada en Meta.",
  132001: "La plantilla no existe o no está aprobada en el idioma elegido.",
  132018: "Meta rechazó los datos de la plantilla.",
  131048: "Meta limitó los envíos por calidad del número.",
  130429: "Meta frenó los envíos por exceso de velocidad; se reintentará.",
  131056: "Demasiados mensajes seguidos a la misma persona.",
};

export function cloudErrorText(code: number | undefined) {
  return (code !== undefined && ERROR_TEXT[code]) || `Meta rechazó el envío${code !== undefined ? ` (código ${code})` : ""}.`;
}

export async function getWhatsAppConnection(): Promise<WhatsAppConnection> {
  const s = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID }, select: { whatsappConnection: true } });
  return s?.whatsappConnection === "cloud" ? "cloud" : "qr";
}

export async function setWhatsAppConnection(mode: WhatsAppConnection) {
  await prisma.appSetting.upsert({ where: { id: APP_SETTING_ID }, create: { id: APP_SETTING_ID, whatsappConnection: mode }, update: { whatsappConnection: mode } });
}

async function readSettings() {
  return prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID } });
}

export async function ensureVerifyToken() {
  const s = await readSettings();
  if (s?.cloudVerifyToken) return s.cloudVerifyToken;
  const token = randomBytes(18).toString("base64url");
  await prisma.appSetting.upsert({ where: { id: APP_SETTING_ID }, create: { id: APP_SETTING_ID, cloudVerifyToken: token }, update: { cloudVerifyToken: token } });
  return token;
}

export async function getCloudConfig(): Promise<CloudConfig | null> {
  const s = await readSettings();
  const accessToken = s?.cloudAccessToken ? decryptPassword(s.cloudAccessToken) : null;
  const appSecret = s?.cloudAppSecret ? decryptPassword(s.cloudAppSecret) : null;
  if (!s?.cloudPhoneNumberId || !accessToken || !appSecret || !s.cloudVerifyToken) return null;
  return {
    phoneNumberId: s.cloudPhoneNumberId,
    accessToken,
    appSecret,
    verifyToken: s.cloudVerifyToken,
    templateName: s.cloudTemplateName,
    templateLang: s.cloudTemplateLang,
  };
}

export async function getCloudSettingsView() {
  const s = await readSettings();
  const token = s?.cloudAccessToken ? decryptPassword(s.cloudAccessToken) : null;
  const secret = s?.cloudAppSecret ? decryptPassword(s.cloudAppSecret) : null;
  return {
    connection: (s?.whatsappConnection === "cloud" ? "cloud" : "qr") as WhatsAppConnection,
    phoneNumberId: s?.cloudPhoneNumberId ?? "",
    accessTokenLast4: token ? token.slice(-4) : null,
    appSecretLast4: secret ? secret.slice(-4) : null,
    verifyToken: await ensureVerifyToken(),
    templateName: s?.cloudTemplateName ?? "",
    templateLang: s?.cloudTemplateLang ?? "es",
    lastError: s?.cloudLastError ?? null,
  };
}

export async function saveCloudSettings(input: { phoneNumberId: string; accessToken?: string; appSecret?: string; templateName: string; templateLang: string }) {
  const data = {
    cloudPhoneNumberId: input.phoneNumberId.trim() || null,
    cloudTemplateName: input.templateName.trim() || null,
    cloudTemplateLang: input.templateLang.trim() || "es",
    ...(input.accessToken?.trim() ? { cloudAccessToken: encryptPassword(input.accessToken.trim()) } : {}),
    ...(input.appSecret?.trim() ? { cloudAppSecret: encryptPassword(input.appSecret.trim()) } : {}),
  };
  await prisma.appSetting.upsert({ where: { id: APP_SETTING_ID }, create: { id: APP_SETTING_ID, ...data }, update: data });
}

let lastErrorSaved: string | null | undefined;

async function rememberError(message: string | null) {
  if (lastErrorSaved === message) return;
  lastErrorSaved = message;
  await prisma.appSetting.update({ where: { id: APP_SETTING_ID }, data: { cloudLastError: message } }).catch(() => undefined);
}

async function graph<T>(config: Pick<CloudConfig, "accessToken">, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${config.accessToken}`, ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { code?: number } } & T;
  if (!res.ok || json.error) throw new CloudError(cloudErrorText(json.error?.code), json.error?.code);
  return json;
}

async function sendPayload(config: CloudConfig, payload: Record<string, unknown>) {
  try {
    const res = await graph<{ messages?: { id: string }[] }>(config, `${config.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
    await rememberError(null);
    void recordWhatsAppSent().catch((err) => console.error("[whatsapp-cloud] no se pudo contar el mensaje", err));
    return res.messages?.[0]?.id ?? null;
  } catch (err) {
    const message = err instanceof CloudError ? err.message : "No se pudo conectar con Meta.";
    await rememberError(message);
    console.error(`[whatsapp-cloud] envío rechazado: ${message}`);
    throw err;
  }
}

export function cloudSendText(config: CloudConfig, to: string, text: string) {
  return sendPayload(config, { to, type: "text", text: { body: text, preview_url: true } });
}

export function cloudSendTemplate(config: CloudConfig, to: string, params: string[]) {
  if (!config.templateName) throw new CloudError("Falta el nombre de la plantilla de aviso en Configuración → WhatsApp.");
  return sendPayload(config, {
    to,
    type: "template",
    template: {
      name: config.templateName,
      language: { code: config.templateLang },
      components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: templateParam(p) })) }],
    },
  });
}

export function cloudSendButtons(config: CloudConfig, to: string, body: string, buttons: { id: string; title: string }[]) {
  return sendPayload(config, {
    to,
    type: "interactive",
    interactive: { type: "button", body: { text: body }, action: { buttons: buttons.map((b) => ({ type: "reply", reply: b })) } },
  });
}

async function uploadMedia(config: CloudConfig, buffer: Buffer, mimeType: string, fileName: string) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);
  const res = await graph<{ id: string }>(config, `${config.phoneNumberId}/media`, { method: "POST", body: form });
  return res.id;
}

export async function cloudSendImage(config: CloudConfig, to: string, buffer: Buffer, mimeType: string, caption?: string) {
  const id = await uploadMedia(config, buffer, mimeType, "imagen");
  return sendPayload(config, { to, type: "image", image: { id, ...(caption ? { caption } : {}) } });
}

export async function cloudSendDocument(config: CloudConfig, to: string, buffer: Buffer, fileName: string, mimeType: string) {
  const id = await uploadMedia(config, buffer, mimeType, fileName);
  return sendPayload(config, { to, type: "document", document: { id, filename: fileName } });
}

export async function cloudTyping(config: CloudConfig, messageId: string) {
  await graph(config, `${config.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId, typing_indicator: { type: "text" } }),
  }).catch(() => undefined);
}

export async function cloudDownloadMedia(config: CloudConfig, mediaId: string): Promise<{ buffer: Buffer; mimeType: string; size: number } | null> {
  try {
    const meta = await graph<{ url: string; mime_type: string; file_size: number }>(config, mediaId);
    const res = await fetch(meta.url, { headers: { authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: meta.mime_type, size: meta.file_size };
  } catch (err) {
    console.error("[whatsapp-cloud] no se pudo descargar un archivo", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function verifyCloudConnection(): Promise<{ ok: true; displayNumber: string; name: string } | { ok: false; error: string }> {
  const config = await getCloudConfig();
  if (!config) return { ok: false, error: "Faltan datos: identificador del número, token de acceso y clave secreta de la app." };
  try {
    const res = await graph<{ display_phone_number: string; verified_name: string }>(config, `${config.phoneNumberId}?fields=display_phone_number,verified_name`);
    await rememberError(null);
    return { ok: true, displayNumber: res.display_phone_number, name: res.verified_name };
  } catch (err) {
    const error = err instanceof CloudError ? err.message : "No se pudo conectar con Meta.";
    await rememberError(error);
    return { ok: false, error };
  }
}
