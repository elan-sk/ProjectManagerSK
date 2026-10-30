import type { WAMessage } from "@whiskeysockets/baileys";
import { replyInGroup } from "@/lib/whatsapp";
import type { GroupLine } from "@/lib/whatsappCloudFormat";

const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const GROUP_BUFFER_MAX = 50;

type GroupRequest = { groupJid: string; mention: WAMessage; createdAt: number };

const globalForGroups = globalThis as unknown as { whatsappGroupRequests?: Map<string, GroupRequest>; whatsappGroupLines?: Map<string, GroupLine[]> };
const requests: Map<string, GroupRequest> = (globalForGroups.whatsappGroupRequests ??= new Map());
const lines: Map<string, GroupLine[]> = (globalForGroups.whatsappGroupLines ??= new Map());

export function rememberGroupLine(groupJid: string, line: GroupLine) {
  const list = lines.get(groupJid) ?? [];
  list.push(line);
  lines.set(groupJid, list.slice(-GROUP_BUFFER_MAX));
}

export function groupLines(groupJid: string) {
  return lines.get(groupJid) ?? [];
}

export function openGroupRequest(userId: string, groupJid: string, mention: WAMessage) {
  requests.set(userId, { groupJid, mention, createdAt: Date.now() });
}

export function hasOpenGroupRequest(userId: string) {
  const r = requests.get(userId);
  if (r && Date.now() - r.createdAt > REQUEST_TTL_MS) requests.delete(userId);
  return requests.has(userId);
}

export async function postGroupResult(userId: string, text: string) {
  if (!hasOpenGroupRequest(userId)) return { ok: false as const, error: "No hay un pedido del grupo abierto para esta persona." };
  const r = requests.get(userId)!;
  const sent = await replyInGroup(r.groupJid, text, r.mention);
  if (!sent) return { ok: false as const, error: "No se pudo publicar en el grupo: el número del QR no está conectado." };
  requests.delete(userId);
  return { ok: true as const };
}
