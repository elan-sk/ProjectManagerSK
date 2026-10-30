import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { WAMessage, WASocket, proto } from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";
import { APP_SETTING_ID } from "@/lib/appSettings";
import { LIVE_PROJECT_WHERE } from "@/lib/permissions";
import { INTERNAL_CHAT_HEADER, internalChatSecret } from "@/lib/actorContext";
import { isWhatsappChatEnabled } from "@/lib/botSettings";
import { getChontatecHistory, hasPendingChontatecAction, type ChatUiMessage } from "@/lib/chontatec";
import { blockedByTestMode, sendChatReply, sendCloudChatIntroIfNeeded, sendConfirmPoll } from "@/lib/whatsapp";
import { cloudDownloadMedia, cloudSendButtons, cloudSendDocument, cloudSendText, cloudTyping, getWhatsAppConnection, type CloudConfig } from "@/lib/whatsappCloud";
import { buildGroupRequest, FORWARD_JOIN_MS, joinChatParts, recentGroupLines, stripBotMention, type ChatPart } from "@/lib/whatsappCloudFormat";
import { groupLines, openGroupRequest, rememberGroupLine } from "@/lib/whatsappGroupRequests";
import { extractUploadFiles, normalizePhone, parseConfirmation, splitWhatsApp, toWhatsAppText } from "@/lib/whatsappFormat";
import { withUploadNote } from "@/lib/chatUploadNote";
import { findUploadPath } from "@/lib/persistentUploads";
import { saveUploadedFile } from "@/lib/uploadFile";
import { EXTENSION_MIME, MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE, mimeFromFileName } from "@/lib/uploadLimits";
import { transcribeAudio } from "@/lib/voiceTranscription";

export const POLL_CONFIRM = "✅ Confirmar";
export const POLL_CANCEL = "❌ Cancelar";
const POLL_QUESTION = "¿Confirma esta acción?";
const POLL_TTL_MS = 24 * 60 * 60 * 1000;
const INTERNAL_TIMEOUT_MS = 120_000;

export const UNSUPPORTED_TEXT = "Por ahora solo leo texto, notas de voz, imágenes y documentos.";
export const VOICE_TOO_LONG_TEXT = "La nota de voz es muy larga; máximo 5 minutos.";
export const VOICE_FAILED_TEXT = "No se pudo entender la nota de voz; puede intentarlo de nuevo o escribirlo.";
const INTERNAL_ERROR_TEXT = "Hubo un problema al responder. Puede intentarlo de nuevo en un momento.";
const IRREVERSIBLE_TEXT = "⚠️ Esto no se puede deshacer.";
const ANSWER_HINT_POLL = "Toque una opción de la encuesta o responda *sí* o *no*.";
const ANSWER_HINT_BUTTONS = "Toque un botón o responda *sí* o *no*.";

type ChatUser = { id: string; name: string; role: string };
type PendingPoll = { userId: string; toolUseId: string; secret: Uint8Array; jid: string; createdAt: number };
type Transport = {
  reply: (parts: string[], files?: { url: string; name: string }[]) => Promise<void>;
  confirm: (toolUseId: string) => Promise<void>;
  answerHint: string;
  typing: (task: () => Promise<void>) => Promise<void>;
};
type Batch = { parts: ChatPart[]; timer: ReturnType<typeof setTimeout>; transport: Transport; user: ChatUser };

const globalForChat = globalThis as unknown as {
  whatsappChatQueues?: Map<string, Promise<unknown>>;
  whatsappChatPolls?: Map<string, PendingPoll>;
  whatsappChatBatches?: Map<string, Batch>;
  whatsappCloudSeen?: Map<string, number>;
};
const queues: Map<string, Promise<unknown>> = (globalForChat.whatsappChatQueues ??= new Map());
const polls: Map<string, PendingPoll> = (globalForChat.whatsappChatPolls ??= new Map());
const batches: Map<string, Batch> = (globalForChat.whatsappChatBatches ??= new Map());
const seenCloudIds: Map<string, number> = (globalForChat.whatsappCloudSeen ??= new Map());

const UNSUPPORTED_TYPES = new Set(["videoMessage", "stickerMessage", "locationMessage", "liveLocationMessage", "contactMessage", "contactsArrayMessage", "ptvMessage"]);

function enqueue(userId: string, task: () => Promise<void>) {
  const run = (queues.get(userId) ?? Promise.resolve()).then(task).catch((err) => console.error("[whatsapp-chat] falló el procesamiento de un mensaje", err));
  queues.set(userId, run);
  void run.then(() => {
    if (queues.get(userId) === run) queues.delete(userId);
  });
}

const TYPING_REFRESH_MS = 8_000;

function qrTransport(sock: WASocket, jid: string, userId: string): Transport {
  return {
    reply: async (parts, files = []) => {
      await sendChatReply(jid, userId, parts, files);
    },
    confirm: async (toolUseId) => {
      const sent = await sendConfirmPoll(jid, POLL_QUESTION, [POLL_CONFIRM, POLL_CANCEL]);
      const secret = sent?.message?.messageContextInfo?.messageSecret;
      if (sent?.key.id && secret) {
        prunePolls();
        polls.set(sent.key.id, { userId, toolUseId, secret, jid, createdAt: Date.now() });
      }
    },
    answerHint: ANSWER_HINT_POLL,
    typing: async (task) => {
      const ping = () => sock.sendPresenceUpdate("composing", jid).catch(() => undefined);
      await ping();
      const timer = setInterval(ping, TYPING_REFRESH_MS);
      try {
        await task();
      } finally {
        clearInterval(timer);
        await sock.sendPresenceUpdate("paused", jid).catch(() => undefined);
      }
    },
  };
}

const CLOUD_TYPING_REFRESH_MS = 20_000;

function cloudTransport(config: CloudConfig, phone: string, userId: string, messageId: string): Transport {
  return {
    reply: async (parts, files = []) => {
      try {
        await sendCloudChatIntroIfNeeded(phone, userId);
        for (const text of parts) await cloudSendText(config, phone, text);
        for (const file of files) {
          const path = await findUploadPath(file.url);
          const buffer = path ? await readFile(path).catch(() => null) : null;
          if (buffer) await cloudSendDocument(config, phone, buffer, file.name, mimeFromFileName(file.name, file.url) || "application/octet-stream");
        }
      } catch (err) {
        console.error("[whatsapp-chat] no se pudo responder por la API oficial", err instanceof Error ? err.message : err);
      }
    },
    confirm: async (toolUseId) => {
      await cloudSendButtons(config, phone, POLL_QUESTION, [
        { id: `confirm:${toolUseId}`, title: POLL_CONFIRM },
        { id: `decline:${toolUseId}`, title: POLL_CANCEL },
      ]).catch(() => undefined);
    },
    answerHint: ANSWER_HINT_BUTTONS,
    typing: async (task) => {
      await cloudTyping(config, messageId);
      const timer = setInterval(() => void cloudTyping(config, messageId), CLOUD_TYPING_REFRESH_MS);
      try {
        await task();
      } finally {
        clearInterval(timer);
      }
    },
  };
}

function jidUser(jid: string) {
  return jid.split("@")[0].split(":")[0];
}

async function resolvePhone(sock: WASocket, jid: string, alt: string | undefined, isLidUser: (jid: string) => boolean | undefined): Promise<string | null> {
  if (!isLidUser(jid)) return normalizePhone(jidUser(jid));
  if (alt && !isLidUser(alt)) return normalizePhone(jidUser(alt));
  const pn = await sock.signalRepository.lidMapping.getPNForLID(jid).catch(() => null);
  return pn ? normalizePhone(jidUser(pn)) : null;
}

async function findUserByPhone(phone: string): Promise<ChatUser | null> {
  const candidates = await prisma.user.findMany({ where: { active: true, phone: { not: null } }, select: { id: true, name: true, role: true, phone: true } });
  const matches = candidates.filter((u) => normalizePhone(u.phone) === phone);
  if (matches.length > 1) console.warn(`[whatsapp-chat] el número ${phone.slice(0, 4)}*** está cargado en ${matches.length} usuarios activos; no se responde`);
  return matches.length === 1 ? { id: matches[0].id, name: matches[0].name, role: matches[0].role } : null;
}

async function markInbound(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { whatsappLastInboundAt: new Date() } }).catch(() => undefined);
}

async function callInternal(body: Record<string, unknown>): Promise<ChatUiMessage[] | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/whatsapp/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", [INTERNAL_CHAT_HEADER]: internalChatSecret() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(INTERNAL_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[whatsapp-chat] la entrada interna respondió ${res.status}`);
      return null;
    }
    return ((await res.json()) as { messages: ChatUiMessage[] }).messages;
  } catch (err) {
    console.error("[whatsapp-chat] no se pudo llamar a la entrada interna", err);
    return null;
  }
}

function prunePolls() {
  const now = Date.now();
  for (const [id, poll] of polls) if (now - poll.createdAt > POLL_TTL_MS) polls.delete(id);
}

async function sendPendingConfirmation(t: Transport, user: ChatUser) {
  const toolUseId = await hasPendingChontatecAction(user.id, "whatsapp");
  if (!toolUseId) return;
  const pending = (await getChontatecHistory(user.id, "whatsapp")).findLast((m) => m.pendingAction?.toolUseId === toolUseId)?.pendingAction;
  if (!pending) return;
  const summary = [pending.destructive ? IRREVERSIBLE_TEXT : "", toWhatsAppText(pending.label), t.answerHint].filter(Boolean).join("\n");
  await t.reply([summary]);
  await t.confirm(toolUseId);
}

async function deliver(t: Transport, user: ChatUser, messages: ChatUiMessage[] | null, prefix = "") {
  if (!messages) {
    await t.reply([prefix ? `${prefix}\n\n${INTERNAL_ERROR_TEXT}` : INTERNAL_ERROR_TEXT]);
    return;
  }
  const visible = messages.filter((m) => (m.role === "assistant" && m.text) || (m.role === "system" && m.text.startsWith("❌")));
  const raw = visible.map((m) => m.text).join("\n\n");
  const text = [prefix, toWhatsAppText(raw)].filter(Boolean).join("\n\n");
  if (text) await t.reply(splitWhatsApp(text), extractUploadFiles(raw));
  await sendPendingConfirmation(t, user);
}

async function dispatch(t: Transport, user: ChatUser, text: string, prefix = "") {
  const pendingId = await hasPendingChontatecAction(user.id, "whatsapp");
  const decision = pendingId ? parseConfirmation(text) : null;
  const messages =
    pendingId && decision
      ? await callInternal({ action: "decision", userId: user.id, toolUseId: pendingId, decision })
      : await callInternal({ action: "message", userId: user.id, text });
  await deliver(t, user, messages, prefix);
}

async function decide(t: Transport, user: ChatUser, toolUseId: string, decision: "confirm" | "decline") {
  const pendingId = await hasPendingChontatecAction(user.id, "whatsapp");
  if (pendingId !== toolUseId) return;
  await deliver(t, user, await callInternal({ action: "decision", userId: user.id, toolUseId, decision }));
}

function submit(t: Transport, user: ChatUser, part: ChatPart, prefix = "") {
  const open = batches.get(user.id);
  if (!part.forwarded && !open) {
    enqueue(user.id, () => t.typing(() => dispatch(t, user, part.text, prefix)));
    return;
  }
  const batch = open ?? { parts: [], timer: setTimeout(() => undefined, 0), transport: t, user };
  clearTimeout(batch.timer);
  batch.parts.push(part);
  batch.transport = t;
  batch.timer = setTimeout(() => {
    batches.delete(user.id);
    enqueue(user.id, () => batch.transport.typing(() => dispatch(batch.transport, user, joinChatParts(batch.parts))));
  }, FORWARD_JOIN_MS);
  batches.set(user.id, batch);
}

function extensionFor(mimetype: string | null | undefined, fileName?: string | null) {
  const fromName = fileName?.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase();
  if (fromName && EXTENSION_MIME[fromName]) return "";
  const clean = (mimetype ?? "").split(";")[0].trim();
  return Object.keys(EXTENSION_MIME).find((e) => EXTENSION_MIME[e] === clean) ?? "";
}

function fileSize(length: unknown) {
  return typeof length === "number" ? length : Number((length as { toString(): string } | null)?.toString() ?? 0);
}

async function fileToPart(t: Transport, buffer: Buffer | null, baseName: string, mimetype: string | null | undefined, caption: string, forwarded: boolean): Promise<ChatPart | null> {
  if (!buffer) {
    await t.reply([INTERNAL_ERROR_TEXT]);
    return null;
  }
  const name = `${baseName}${extensionFor(mimetype, baseName)}`;
  const saved = await saveUploadedFile(new File([new Uint8Array(buffer)], name, { type: (mimetype ?? "").split(";")[0] }));
  if (!saved.ok) {
    await t.reply([saved.error]);
    return null;
  }
  return { text: withUploadNote(caption, [{ name: saved.name, url: saved.url }]), forwarded };
}

async function audioToPart(t: Transport, buffer: Buffer | null, seconds: number | null | undefined, forwarded: boolean): Promise<{ part: ChatPart; prefix: string } | null> {
  const result = buffer ? await transcribeAudio(buffer, seconds) : ({ ok: false, reason: "failed" } as const);
  if (!result.ok) {
    await t.reply([result.reason === "too_long" ? VOICE_TOO_LONG_TEXT : VOICE_FAILED_TEXT]);
    return null;
  }
  return { part: { text: result.text, forwarded }, prefix: `🎤 Entendí: «${result.text}»` };
}

function optionHash(option: string) {
  return createHash("sha256").update(option).digest().toString("hex");
}

async function handleVote(sock: WASocket, t: Transport, user: ChatUser, msg: WAMessage, update: proto.Message.IPollUpdateMessage) {
  const pollId = update.pollCreationMessageKey?.id;
  const poll = pollId ? polls.get(pollId) : undefined;
  if (!poll || poll.userId !== user.id || !update.vote) return;
  const { decryptPollVote, jidNormalizedUser } = await import("@whiskeysockets/baileys");
  const me = sock.user;
  const creators = [me?.id, me?.lid].filter((j): j is string => Boolean(j)).map(jidNormalizedUser);
  const voters = [msg.key.remoteJid, msg.key.remoteJidAlt].filter((j): j is string => Boolean(j)).map(jidNormalizedUser);
  let selected: Uint8Array[] | null = null;
  for (const pollCreatorJid of creators) {
    for (const voterJid of voters) {
      try {
        selected = decryptPollVote(update.vote as { encPayload: Uint8Array; encIv: Uint8Array }, { pollCreatorJid, pollMsgId: pollId!, pollEncKey: poll.secret, voterJid }).selectedOptions ?? [];
        break;
      } catch {
        selected = null;
      }
    }
    if (selected) break;
  }
  if (!selected || selected.length === 0) return;
  const chosen = Buffer.from(selected[0]).toString("hex");
  const decision = chosen === optionHash(POLL_CONFIRM) ? "confirm" : chosen === optionHash(POLL_CANCEL) ? "decline" : null;
  if (!decision) return;
  polls.delete(pollId!);
  await decide(t, user, poll.toolUseId, decision);
}

function isForwarded(content: proto.IMessage) {
  const info =
    content.extendedTextMessage?.contextInfo ??
    content.imageMessage?.contextInfo ??
    content.documentMessage?.contextInfo ??
    content.audioMessage?.contextInfo;
  return Boolean(info?.isForwarded);
}

function textOf(content: proto.IMessage | null | undefined) {
  return (content?.conversation ?? content?.extendedTextMessage?.text ?? content?.imageMessage?.caption ?? content?.documentMessage?.caption ?? "").trim();
}

async function groupMentionsEnabled() {
  const s = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID }, select: { botGroupMentionsEnabled: true, whatsappGroupJid: true } });
  return s?.botGroupMentionsEnabled ? s : null;
}

async function handleGroupMessage(sock: WASocket, msg: WAMessage, content: proto.IMessage, isLidUser: (jid: string) => boolean | undefined) {
  const groupJid = msg.key.remoteJid!;
  const settings = await groupMentionsEnabled();
  if (!settings) return;
  const projects = await prisma.project.findMany({ where: { whatsappGroupJid: groupJid, hidden: false, ...LIVE_PROJECT_WHERE }, select: { name: true } });
  if (groupJid !== settings.whatsappGroupJid && projects.length === 0) return;

  const text = textOf(content);
  const participant = msg.key.participant;
  if (!text || !participant) return;
  const phone = await resolvePhone(sock, participant, msg.key.participantAlt, isLidUser);
  const user = phone ? await findUserByPhone(phone) : null;
  const author = user?.name ?? msg.pushName ?? "Alguien";
  const at = new Date(Number(msg.messageTimestamp ?? Date.now() / 1000) * 1000);

  const { jidNormalizedUser } = await import("@whiskeysockets/baileys");
  const me = sock.user;
  const botIds = [me?.id, me?.lid].filter((j): j is string => Boolean(j)).map(jidNormalizedUser);
  const info = content.extendedTextMessage?.contextInfo ?? content.imageMessage?.contextInfo;
  const mentioned = (info?.mentionedJid ?? []).map(jidNormalizedUser).some((j) => botIds.includes(j));
  const previous = recentGroupLines(groupLines(groupJid));
  rememberGroupLine(groupJid, { author, at, text });
  if (!mentioned) return;
  if (!user || !phone || blockedByTestMode(`${phone}@s.whatsapp.net`)) {
    console.warn(`[whatsapp-chat] mención al bot en un grupo de alguien no registrado (${phone ? `${phone.slice(0, 4)}***` : "sin número"}); no se responde`);
    return;
  }

  let quoted: { author: string; text: string } | null = null;
  const quotedText = textOf(info?.quotedMessage);
  if (quotedText) {
    const quotedPhone = info?.participant ? await resolvePhone(sock, info.participant, undefined, isLidUser) : null;
    const quotedUser = quotedPhone ? await findUserByPhone(quotedPhone) : null;
    quoted = { author: quotedUser?.name ?? "otra persona del grupo", text: quotedText };
  }
  const groupName = (await sock.groupMetadata(groupJid).catch(() => null))?.subject ?? "del equipo";
  const request = buildGroupRequest({
    groupName,
    projectName: projects.length === 1 ? projects[0].name : projects.length > 1 ? projects.map((p) => p.name).join(" o ") : null,
    quoted,
    recent: previous,
    request: stripBotMention(text, botIds.map(jidUser)),
  });
  openGroupRequest(user.id, groupJid, msg);
  const dm = `${phone}@s.whatsapp.net`;
  const t = qrTransport(sock, dm, user.id);
  enqueue(user.id, () => t.typing(() => dispatch(t, user, request)));
}

export async function handleIncomingMessage(sock: WASocket, msg: WAMessage) {
  const jid = msg.key.remoteJid;
  if (!msg.message || msg.key.fromMe || !jid) return;
  const { isJidGroup, isJidBroadcast, isJidStatusBroadcast, isJidNewsletter, isLidUser, normalizeMessageContent, getContentType } = await import("@whiskeysockets/baileys");
  if (isJidBroadcast(jid) || isJidStatusBroadcast(jid) || isJidNewsletter(jid)) return;
  const content = normalizeMessageContent(msg.message);
  const type = getContentType(content);
  if (!content || !type || type === "protocolMessage" || type === "reactionMessage" || type === "senderKeyDistributionMessage") return;
  if (isJidGroup(jid)) {
    await handleGroupMessage(sock, msg, content, isLidUser);
    return;
  }
  if (!(await isWhatsappChatEnabled())) return;
  const phone = await resolvePhone(sock, jid, msg.key.remoteJidAlt, isLidUser);
  if (!phone || blockedByTestMode(`${phone}@s.whatsapp.net`)) return;
  const user = await findUserByPhone(phone);
  if (!user) return;
  await markInbound(user.id);

  const t = qrTransport(sock, jid, user.id);
  const forwarded = isForwarded(content);
  if (type === "conversation" || type === "extendedTextMessage") {
    const text = textOf(content);
    if (text) submit(t, user, { text, forwarded });
    return;
  }
  enqueue(user.id, () => t.typing(async () => {
    const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
    if ((type === "imageMessage" && content.imageMessage) || (type === "documentMessage" && content.documentMessage)) {
      const media = (content.imageMessage ?? content.documentMessage)!;
      if (fileSize(media.fileLength) > MAX_UPLOAD_BYTES) return t.reply([TOO_LARGE_MESSAGE]);
      const buffer = await downloadMediaMessage(msg, "buffer", {}).catch((err) => {
        console.error("[whatsapp-chat] no se pudo descargar el archivo", err);
        return null;
      });
      const baseName = type === "documentMessage" ? content.documentMessage?.fileName?.trim() || "documento" : `imagen-${Date.now()}`;
      const part = await fileToPart(t, buffer, baseName, media.mimetype, media.caption?.trim() ?? "", forwarded);
      if (part) submit(t, user, part);
    } else if (type === "audioMessage" && content.audioMessage) {
      if ((content.audioMessage.seconds ?? 0) > 300) return t.reply([VOICE_TOO_LONG_TEXT]);
      const buffer = await downloadMediaMessage(msg, "buffer", {}).catch(() => null);
      const audio = await audioToPart(t, buffer, content.audioMessage.seconds, forwarded);
      if (audio) submit(t, user, audio.part, audio.part.forwarded ? "" : audio.prefix);
    } else if (type === "pollUpdateMessage" && content.pollUpdateMessage) {
      await handleVote(sock, t, user, msg, content.pollUpdateMessage);
    } else if (UNSUPPORTED_TYPES.has(type)) {
      await t.reply([UNSUPPORTED_TEXT]);
    }
  }));
}

export type CloudIncoming = {
  id: string;
  from: string;
  type: string;
  context?: { forwarded?: boolean; frequently_forwarded?: boolean };
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; caption?: string; filename?: string };
  audio?: { id: string; mime_type?: string };
  interactive?: { type: string; button_reply?: { id: string; title: string } };
  button?: { text: string; payload?: string };
};

const SEEN_TTL_MS = 60 * 60 * 1000;

function alreadySeen(id: string) {
  const now = Date.now();
  for (const [key, at] of seenCloudIds) if (now - at > SEEN_TTL_MS) seenCloudIds.delete(key);
  if (seenCloudIds.has(id)) return true;
  seenCloudIds.set(id, now);
  return false;
}

export async function handleCloudIncoming(config: CloudConfig, msg: CloudIncoming) {
  if (alreadySeen(msg.id)) return;
  if ((await getWhatsAppConnection()) !== "cloud" || !(await isWhatsappChatEnabled())) return;
  const phone = normalizePhone(msg.from);
  if (!phone || blockedByTestMode(`${phone}@s.whatsapp.net`)) return;
  const user = await findUserByPhone(phone);
  if (!user) return;
  await markInbound(user.id);

  const t = cloudTransport(config, phone, user.id, msg.id);
  const forwarded = Boolean(msg.context?.forwarded || msg.context?.frequently_forwarded);
  if (msg.type === "text" && msg.text?.body.trim()) {
    submit(t, user, { text: msg.text.body.trim(), forwarded });
    return;
  }
  enqueue(user.id, () => t.typing(async () => {
    const media = msg.image ?? msg.document;
    if ((msg.type === "image" || msg.type === "document") && media) {
      const file = await cloudDownloadMedia(config, media.id);
      if (file && file.size > MAX_UPLOAD_BYTES) return t.reply([TOO_LARGE_MESSAGE]);
      const baseName = msg.type === "document" ? msg.document?.filename?.trim() || "documento" : `imagen-${Date.now()}`;
      const part = await fileToPart(t, file?.buffer ?? null, baseName, media.mime_type ?? file?.mimeType, media.caption?.trim() ?? "", forwarded);
      if (part) submit(t, user, part);
    } else if (msg.type === "audio" && msg.audio) {
      const file = await cloudDownloadMedia(config, msg.audio.id);
      const audio = await audioToPart(t, file?.buffer ?? null, null, forwarded);
      if (audio) submit(t, user, audio.part, audio.part.forwarded ? "" : audio.prefix);
    } else if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const [decision, toolUseId] = msg.interactive.button_reply.id.split(/:(.+)/);
      if ((decision === "confirm" || decision === "decline") && toolUseId) await decide(t, user, toolUseId, decision);
    } else if (msg.type === "button" && msg.button?.text) {
      submit(t, user, { text: msg.button.text, forwarded: false });
    } else {
      await t.reply([UNSUPPORTED_TEXT]);
    }
  }));
}

