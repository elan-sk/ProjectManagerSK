import { createHmac, timingSafeEqual } from "node:crypto";

export const CLOUD_WINDOW_MS = 24 * 60 * 60 * 1000;
export const GROUP_CONTEXT_MAX_MESSAGES = 20;
export const GROUP_CONTEXT_MAX_AGE_MS = 3 * 60 * 60 * 1000;
export const FORWARD_JOIN_MS = 5_000;
export const SUMMARY_MAX_CHARS = 300;

export function isWindowOpen(lastInboundAt: Date | null | undefined, now = new Date()) {
  return Boolean(lastInboundAt && now.getTime() - lastInboundAt.getTime() < CLOUD_WINDOW_MS);
}

const URL_RE = /https?:\/\/[^\s)>\]]+/;

export function noticeLink(text: string, fallback: string) {
  return text.match(URL_RE)?.[0] ?? fallback;
}

export function oneLineSummary(text: string, max = SUMMARY_MAX_CHARS) {
  const flat = text
    .replace(new RegExp(URL_RE.source, "g"), "")
    .replace(/🔗/g, "")
    .replace(/[*_~`]/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat || "Aviso nuevo";
}

export function templateParam(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim() || "-";
}

export function validWebhookSignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex"));
  const given = Buffer.from(header.slice("sha256=".length).toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function usedThisPeriod(periodStart: Date | null, used: number, now = new Date()) {
  return periodStart && periodStart >= monthStart(now) ? used : 0;
}

export function limitWarningToSend(used: number, limit: number, warnedPct: number): 80 | 100 | null {
  if (limit <= 0) return null;
  const pct = (used / limit) * 100;
  if (pct >= 100 && warnedPct < 100) return 100;
  if (pct >= 80 && warnedPct < 80) return 80;
  return null;
}

export type GroupLine = { author: string; at: Date; text: string };

export function recentGroupLines(lines: GroupLine[], now = new Date()) {
  return lines.filter((l) => now.getTime() - l.at.getTime() <= GROUP_CONTEXT_MAX_AGE_MS).slice(-GROUP_CONTEXT_MAX_MESSAGES);
}

const TIME_FORMAT = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit", hour12: true });

export function buildGroupRequest(input: {
  groupName: string;
  projectName: string | null;
  quoted: { author: string; text: string } | null;
  recent: GroupLine[];
  request: string;
}) {
  const head = `[Pedido hecho en el grupo de WhatsApp «${input.groupName}»${input.projectName ? `, del proyecto «${input.projectName}»` : ""}]`;
  const quoted = input.quoted ? `Responde a este mensaje de ${input.quoted.author}: «${input.quoted.text}»` : "";
  const recent = input.recent.length
    ? `Mensajes recientes del grupo (solo para ubicar lo relacionado con el pedido):\n${input.recent.map((l) => `- ${TIME_FORMAT.format(l.at)} ${l.author}: ${l.text}`).join("\n")}`
    : "";
  const request = `Pedido: ${input.request.trim() || (input.quoted ? "hacer lo que dice el mensaje citado" : "(sin texto)")}`;
  return [head, quoted, recent, request].filter(Boolean).join("\n\n");
}

export type ChatPart = { text: string; forwarded: boolean };

export function joinChatParts(parts: ChatPart[]) {
  if (!parts.some((p) => p.forwarded)) return parts.map((p) => p.text).join("\n\n");
  const forwarded = parts.filter((p) => p.forwarded).map((p) => `«${p.text}»`);
  const comments = parts.filter((p) => !p.forwarded).map((p) => p.text);
  return [
    `[Mensaje${forwarded.length > 1 ? "s" : ""} reenviado${forwarded.length > 1 ? "s" : ""} por la persona; WhatsApp no indica quién lo escribió originalmente. Tomalo como un pedido a hacer]`,
    forwarded.join("\n"),
    comments.length ? `Comentario de la persona: ${comments.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function stripBotMention(text: string, botNumbers: string[]) {
  return botNumbers.reduce((acc, n) => acc.replace(new RegExp(`@${n}\\b`, "g"), ""), text).replace(/\s{2,}/g, " ").trim();
}

export function cloudImageMime(buffer: Buffer): "image/jpeg" | "image/png" | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  return null;
}
