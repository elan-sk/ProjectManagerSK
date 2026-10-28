import { createHash } from "node:crypto";
import type { WAMessage, WAMessageKey, WASocket, proto } from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";
import { INTERNAL_CHAT_HEADER, internalChatSecret } from "@/lib/actorContext";
import { isWhatsappChatEnabled } from "@/lib/botSettings";
import { getChontatecHistory, hasPendingChontatecAction, type ChatUiMessage } from "@/lib/chontatec";
import { blockedByTestMode, sendChatReply, sendConfirmPoll } from "@/lib/whatsapp";
import { extractUploadFiles, normalizePhone, parseConfirmation, splitWhatsApp, toWhatsAppText } from "@/lib/whatsappFormat";
import { withUploadNote } from "@/lib/chatUploadNote";
import { saveUploadedFile } from "@/lib/uploadFile";
import { EXTENSION_MIME, MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE } from "@/lib/uploadLimits";
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
const ANSWER_HINT = "Toque una opción de la encuesta o responda *sí* o *no*.";

type ChatUser = { id: string; name: string; role: string };
type PendingPoll = { userId: string; toolUseId: string; secret: Uint8Array; jid: string; createdAt: number };

const globalForChat = globalThis as unknown as { whatsappChatQueues?: Map<string, Promise<unknown>>; whatsappChatPolls?: Map<string, PendingPoll> };
const queues: Map<string, Promise<unknown>> = (globalForChat.whatsappChatQueues ??= new Map());
const polls: Map<string, PendingPoll> = (globalForChat.whatsappChatPolls ??= new Map());

const UNSUPPORTED_TYPES = new Set(["videoMessage", "stickerMessage", "locationMessage", "liveLocationMessage", "contactMessage", "contactsArrayMessage", "ptvMessage"]);

function enqueue(userId: string, task: () => Promise<void>) {
  const run = (queues.get(userId) ?? Promise.resolve()).then(task).catch((err) => console.error("[whatsapp-chat] falló el procesamiento de un mensaje", err));
  queues.set(userId, run);
  void run.then(() => {
    if (queues.get(userId) === run) queues.delete(userId);
  });
}

function jidUser(jid: string) {
  return jid.split("@")[0].split(":")[0];
}

async function resolvePhone(sock: WASocket, key: WAMessageKey, isLidUser: (jid: string) => boolean | undefined): Promise<string | null> {
  const jid = key.remoteJid ?? "";
  if (!isLidUser(jid)) return normalizePhone(jidUser(jid));
  if (key.remoteJidAlt && !isLidUser(key.remoteJidAlt)) return normalizePhone(jidUser(key.remoteJidAlt));
  const pn = await sock.signalRepository.lidMapping.getPNForLID(jid).catch(() => null);
  return pn ? normalizePhone(jidUser(pn)) : null;
}

async function findUserByPhone(phone: string): Promise<ChatUser | null> {
  const candidates = await prisma.user.findMany({ where: { active: true, phone: { not: null } }, select: { id: true, name: true, role: true, phone: true } });
  const matches = candidates.filter((u) => normalizePhone(u.phone) === phone);
  if (matches.length > 1) console.warn(`[whatsapp-chat] el número ${phone.slice(0, 4)}*** está cargado en ${matches.length} usuarios activos; no se responde`);
  return matches.length === 1 ? { id: matches[0].id, name: matches[0].name, role: matches[0].role } : null;
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

async function sendPendingPoll(jid: string, user: ChatUser) {
  const toolUseId = await hasPendingChontatecAction(user.id, "whatsapp");
  if (!toolUseId) return;
  const pending = (await getChontatecHistory(user.id, "whatsapp")).findLast((m) => m.pendingAction?.toolUseId === toolUseId)?.pendingAction;
  if (!pending) return;
  const summary = [pending.destructive ? IRREVERSIBLE_TEXT : "", toWhatsAppText(pending.label), ANSWER_HINT].filter(Boolean).join("\n");
  await sendChatReply(jid, user.id, [summary]);
  const sent = await sendConfirmPoll(jid, POLL_QUESTION, [POLL_CONFIRM, POLL_CANCEL]);
  const secret = sent?.message?.messageContextInfo?.messageSecret;
  if (sent?.key.id && secret) {
    prunePolls();
    polls.set(sent.key.id, { userId: user.id, toolUseId, secret, jid, createdAt: Date.now() });
  }
}

async function deliver(jid: string, user: ChatUser, messages: ChatUiMessage[] | null, prefix = "") {
  if (!messages) {
    await sendChatReply(jid, user.id, [prefix ? `${prefix}\n\n${INTERNAL_ERROR_TEXT}` : INTERNAL_ERROR_TEXT]);
    return;
  }
  const visible = messages.filter((m) => (m.role === "assistant" && m.text) || (m.role === "system" && m.text.startsWith("❌")));
  const raw = visible.map((m) => m.text).join("\n\n");
  const text = [prefix, toWhatsAppText(raw)].filter(Boolean).join("\n\n");
  if (text) await sendChatReply(jid, user.id, splitWhatsApp(text), extractUploadFiles(raw));
  await sendPendingPoll(jid, user);
}

async function dispatch(jid: string, user: ChatUser, text: string, prefix = "") {
  const pendingId = await hasPendingChontatecAction(user.id, "whatsapp");
  const decision = pendingId ? parseConfirmation(text) : null;
  const messages =
    pendingId && decision
      ? await callInternal({ action: "decision", userId: user.id, toolUseId: pendingId, decision })
      : await callInternal({ action: "message", userId: user.id, text });
  await deliver(jid, user, messages, prefix);
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

async function handleFile(jid: string, user: ChatUser, msg: WAMessage, media: proto.Message.IImageMessage | proto.Message.IDocumentMessage, kind: "image" | "document") {
  if (fileSize(media.fileLength) > MAX_UPLOAD_BYTES) {
    await sendChatReply(jid, user.id, [TOO_LARGE_MESSAGE]);
    return;
  }
  const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
  const buffer = await downloadMediaMessage(msg, "buffer", {}).catch((err) => {
    console.error("[whatsapp-chat] no se pudo descargar el archivo", err);
    return null;
  });
  if (!buffer) {
    await sendChatReply(jid, user.id, [INTERNAL_ERROR_TEXT]);
    return;
  }
  const baseName = kind === "document" ? (media as proto.Message.IDocumentMessage).fileName?.trim() || "documento" : `imagen-${Date.now()}`;
  const name = `${baseName}${extensionFor(media.mimetype, baseName)}`;
  const saved = await saveUploadedFile(new File([new Uint8Array(buffer)], name, { type: (media.mimetype ?? "").split(";")[0] }));
  if (!saved.ok) {
    await sendChatReply(jid, user.id, [saved.error]);
    return;
  }
  await dispatch(jid, user, withUploadNote(media.caption?.trim() ?? "", [{ name: saved.name, url: saved.url }]));
}

async function handleAudio(jid: string, user: ChatUser, msg: WAMessage, audio: proto.Message.IAudioMessage) {
  if ((audio.seconds ?? 0) > 300) {
    await sendChatReply(jid, user.id, [VOICE_TOO_LONG_TEXT]);
    return;
  }
  const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
  const buffer = await downloadMediaMessage(msg, "buffer", {}).catch(() => null);
  const result = buffer ? await transcribeAudio(buffer, audio.seconds) : ({ ok: false, reason: "failed" } as const);
  if (!result.ok) {
    await sendChatReply(jid, user.id, [result.reason === "too_long" ? VOICE_TOO_LONG_TEXT : VOICE_FAILED_TEXT]);
    return;
  }
  await dispatch(jid, user, result.text, `🎤 Entendí: «${result.text}»`);
}

function optionHash(option: string) {
  return createHash("sha256").update(option).digest().toString("hex");
}

async function handleVote(sock: WASocket, jid: string, user: ChatUser, msg: WAMessage, update: proto.Message.IPollUpdateMessage) {
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
  const pendingId = await hasPendingChontatecAction(user.id, "whatsapp");
  polls.delete(pollId!);
  if (pendingId !== poll.toolUseId) return;
  await deliver(jid, user, await callInternal({ action: "decision", userId: user.id, toolUseId: pendingId, decision }));
}

export async function handleIncomingMessage(sock: WASocket, msg: WAMessage) {
  const jid = msg.key.remoteJid;
  if (!msg.message || msg.key.fromMe || !jid) return;
  const { isJidGroup, isJidBroadcast, isJidStatusBroadcast, isJidNewsletter, isLidUser, normalizeMessageContent, getContentType } = await import("@whiskeysockets/baileys");
  if (isJidGroup(jid) || isJidBroadcast(jid) || isJidStatusBroadcast(jid) || isJidNewsletter(jid)) return;
  const content = normalizeMessageContent(msg.message);
  const type = getContentType(content);
  if (!content || !type || type === "protocolMessage" || type === "reactionMessage" || type === "senderKeyDistributionMessage") return;
  if (!(await isWhatsappChatEnabled())) return;
  const phone = await resolvePhone(sock, msg.key, isLidUser);
  if (!phone || blockedByTestMode(`${phone}@s.whatsapp.net`)) return;
  const user = await findUserByPhone(phone);
  if (!user) return;

  enqueue(user.id, async () => {
    if (type === "conversation" || type === "extendedTextMessage") {
      const text = (content.conversation ?? content.extendedTextMessage?.text ?? "").trim();
      if (text) await dispatch(jid, user, text);
    } else if (type === "imageMessage" && content.imageMessage) {
      await handleFile(jid, user, msg, content.imageMessage, "image");
    } else if (type === "documentMessage" && content.documentMessage) {
      await handleFile(jid, user, msg, content.documentMessage, "document");
    } else if (type === "audioMessage" && content.audioMessage) {
      await handleAudio(jid, user, msg, content.audioMessage);
    } else if (type === "pollUpdateMessage" && content.pollUpdateMessage) {
      await handleVote(sock, jid, user, msg, content.pollUpdateMessage);
    } else if (UNSUPPORTED_TYPES.has(type)) {
      await sendChatReply(jid, user.id, [UNSUPPORTED_TEXT]);
    }
  });
}
