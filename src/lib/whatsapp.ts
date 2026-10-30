import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { findUploadPath } from "@/lib/persistentUploads";
import { rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getBotName, getBotAvatarBuffer, getBotIntroMessage } from "@/lib/botSettings";
import { mimeFromFileName } from "@/lib/uploadLimits";
import { absoluteUrl } from "@/lib/appUrl";
import { APP_SETTING_ID } from "@/lib/appSettings";
import { LIMIT_REACHED_REASON, recordWhatsAppSent, whatsAppLimitReached } from "@/lib/whatsappUsage";
import { cloudSendImage, cloudSendTemplate, cloudSendText, getCloudConfig, getWhatsAppConnection } from "@/lib/whatsappCloud";
import { cloudImageMime, isWindowOpen, noticeLink, oneLineSummary } from "@/lib/whatsappCloudFormat";

// Alertas de WhatsApp vía sesión personal (estilo WhatsApp Web, no la API
// oficial de Meta) — ver AGENTS.md. Se conecta una sola vez (al bootear el
// server si WHATSAPP_ENABLED=true, o a pedido desde el botón de un admin en
// Configuración) y queda escuchando en este módulo.
export type WhatsAppStatus = "disconnected" | "connecting" | "connected";

type WhatsAppState = {
  sock: WASocket | null;
  rawSocket: WASocket | null;
  connecting: Promise<void> | null;
  retryCount: number;
  manualStop: boolean;
  status: WhatsAppStatus;
  qrDataUrl: string | null;
  // Motivo de la última caída (para la alarma del header del administrador).
  lastDisconnectReason: string | null;
  lastDisconnectAt: number | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  // Fila de mensajes que inicia la app, con pausa entre uno y otro (ver paced).
  paceChain?: Promise<unknown>;
  nextSendAt?: number;
};

// ponytail: mismo patrón que prisma.ts (singleton en globalThis) — sin esto,
// cada hot-reload de Next.js (al editar CUALQUIER archivo del servidor)
// re-evalúa este módulo y sus `let` vuelven a su valor inicial, mientras el
// socket viejo sigue vivo por su cuenta. Con varias ediciones seguidas
// terminan compitiendo varias copias fantasma por la MISMA sesión de
// WhatsApp, echándose una a otra en loop de reconexión infinito (lo que
// generó 384 reconexiones en una sesión real). Viviendo en globalThis, el
// módulo se re-evalúa pero siempre reengancha al mismo estado.
const globalForWhatsApp = globalThis as unknown as { whatsapp?: WhatsAppState };
const state: WhatsAppState =
  globalForWhatsApp.whatsapp ??
  {
    sock: null,
    rawSocket: null,
    connecting: null,
    retryCount: 0,
    manualStop: false,
    status: "disconnected",
    qrDataUrl: null,
    lastDisconnectReason: null,
    lastDisconnectAt: null,
    reconnectTimer: null,
  };
// Siempre (también en producción): la cabecera, Configuración y el programador de tareas se
// cargan como módulos distintos y, sin esto, cada uno tenía SU copia del estado (uno decía
// "Conectado" y otro "caído", y el programador nunca veía la conexión real).
globalForWhatsApp.whatsapp = state;

// Reconexión automática en segundo plano: ante una caída que NO sea un
// cierre de sesión explícito (logout desde el teléfono), se reintenta sin
// límite con espera creciente (2s, 4s, … tope 60s). No depende de que el
// administrador tenga la web abierta; además scheduler.ts la revisa cada
// minuto (ensureWhatsAppAlive) por si un reintento se pierde.
const RETRY_BASE_DELAY_MS = 2000;
const RETRY_MAX_DELAY_MS = 60_000;
const AUTH_DIR = path.join(process.cwd(), ".baileys-auth");

// Pausa al azar entre mensajes que inicia la app (alertas, cola, resúmenes): una ráfaga desde un
// número es de las señales más fuertes de spam para WhatsApp y puede bloquearlo. Las respuestas del
// chat a quien escribe no pasan por acá. `urgent` (recuperar contraseña, prueba, pedidos al bot que
// la persona espera) sale enseguida, pero igual corre la pausa del siguiente.
// ponytail: fila en memoria; si el proceso se reinicia, lo pendiente vuelve a salir desde la cola.
const PACE_MIN_MS = 20_000;
const PACE_MAX_MS = 40_000;
function paced(send: () => Promise<boolean>, urgent = false): Promise<boolean> {
  const markSent = (sent: boolean) => {
    if (sent) state.nextSendAt = Date.now() + PACE_MIN_MS + Math.random() * (PACE_MAX_MS - PACE_MIN_MS);
    return sent;
  };
  if (urgent) return send().then(markSent);
  const result = (state.paceChain ?? Promise.resolve()).then(async () => {
    const wait = (state.nextSendAt ?? 0) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return markSent(await send());
  });
  state.paceChain = result.catch(() => false);
  return result;
}

// Modo prueba: con WHATSAPP_ONLY_PHONE definido (solo en desarrollo), ÚNICAMENTE ese número puede
// recibir mensajes; todo lo demás (otras personas y grupos) se descarta. En producción no se define.
const blockedLogged = new Set<string>();
export function blockedByTestMode(jid: string) {
  const only = process.env.WHATSAPP_ONLY_PHONE?.trim();
  if (!only || jid === `${only}@s.whatsapp.net`) return false;
  if (!blockedLogged.has(jid)) {
    blockedLogged.add(jid);
    console.warn(`[whatsapp] modo prueba (WHATSAPP_ONLY_PHONE): no se envía a ${jid}; solo se permite ${only}.`);
  }
  return true;
}

type QrContent = Parameters<WASocket["sendMessage"]>[1];
type QrOptions = Parameters<WASocket["sendMessage"]>[2];

async function qrSend(jid: string, content: QrContent, options?: QrOptions) {
  const sent = await state.sock!.sendMessage(jid, content, options);
  void recordWhatsAppSent().catch((err) => console.error("[whatsapp] no se pudo contar el mensaje", err));
  return sent;
}

export async function replyInGroup(groupJid: string, text: string, quoted: WAMessage | null) {
  if (!state.sock || blockedByTestMode(groupJid)) return false;
  try {
    const botName = await getBotName();
    await qrSend(groupJid, { text: `🤖 *${botName}*\n${text}` }, quoted ? { quoted } : undefined);
    return true;
  } catch (err) {
    console.error("[whatsapp] no se pudo publicar en el grupo", err);
    return false;
  }
}

export function getQrSelf() {
  return state.sock?.user ?? null;
}

export async function shouldRunQr() {
  const s = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID }, select: { whatsappConnection: true, botGroupMentionsEnabled: true } });
  return s?.whatsappConnection !== "cloud" || Boolean(s?.botGroupMentionsEnabled);
}

export async function whatsAppFailureReason() {
  if (await whatsAppLimitReached()) return LIMIT_REACHED_REASON;
  if ((await getWhatsAppConnection()) === "cloud") {
    const s = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID }, select: { cloudLastError: true } });
    return s?.cloudLastError ?? "falló el envío por la API oficial de WhatsApp";
  }
  return state.status === "connected" ? "falló el envío por WhatsApp" : "WhatsApp está desconectado";
}

export function getWhatsAppStatus() {
  return { status: state.status, qrDataUrl: state.qrDataUrl, hasSession: existsSync(path.join(AUTH_DIR, "creds.json")) };
}

// Salud de la conexión para la alarma del header (solo admin). `expected` =
// se espera que esté conectado (hay sesión guardada o se conectó a mano y no
// se detuvo a propósito); si no, no hay nada que alarmar.
export async function getWhatsAppHealth() {
  const hasSession = existsSync(path.join(AUTH_DIR, "creds.json"));
  const settings = await prisma.appSetting.findUnique({ where: { id: APP_SETTING_ID }, select: { whatsappConnection: true, botGroupMentionsEnabled: true, cloudLastError: true } });
  if (settings?.whatsappConnection === "cloud") {
    const config = await getCloudConfig();
    const cloudReason = !config ? "Faltan datos de la API oficial de WhatsApp en Configuración." : settings.cloudLastError;
    const qrDown = settings.botGroupMentionsEnabled && state.status !== "connected";
    return {
      status: cloudReason || qrDown ? ("disconnected" as const) : ("connected" as const),
      expected: true,
      needsQr: !cloudReason && qrDown && !hasSession,
      reason: cloudReason ?? (qrDown ? `Número del QR para el grupo: ${state.lastDisconnectReason ?? "desconectado"}` : null),
      since: state.lastDisconnectAt,
    };
  }
  const expected = !state.manualStop && (hasSession || process.env.WHATSAPP_ENABLED === "true");
  return {
    status: state.status,
    expected,
    needsQr: state.status !== "connected" && !hasSession,
    reason: state.lastDisconnectReason,
    since: state.lastDisconnectAt,
  };
}

// Vigilante (lo llama el poller cada minuto): si debería estar conectado y no
// hay socket ni intento en curso ni reintento agendado, reconecta.
export async function ensureWhatsAppAlive() {
  if (state.manualStop || state.sock || state.connecting || state.reconnectTimer) return;
  if (!existsSync(path.join(AUTH_DIR, "creds.json"))) return;
  if (!(await shouldRunQr())) return;
  void startWhatsApp().catch((err) => console.error("[whatsapp] el vigilante no pudo reconectar", err));
}

export function startWhatsApp() {
  if (state.sock || state.connecting) return state.connecting ?? Promise.resolve();
  state.manualStop = false;
  state.connecting = connect().finally(() => {
    state.connecting = null;
  });
  return state.connecting;
}

// Corta la conexión a mano (no es logout: las credenciales en .baileys-auth
// quedan intactas, así que "Conectar WhatsApp" después reconecta sin QR).
export function stopWhatsApp() {
  state.manualStop = true;
  state.retryCount = 0;
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
  state.connecting = null;
  void state.rawSocket?.end(undefined);
  state.rawSocket = null;
  state.sock = null;
  state.qrDataUrl = null;
  state.status = "disconnected";
}

// Desvincula el número: cierra la sesión en WhatsApp si está abierta (el teléfono deja de
// mostrar el dispositivo) y borra la sesión guardada, así el próximo "Conectar" pide un QR
// nuevo y se puede escanear con otro número. Sirve también cuando la sesión guardada falla y
// los reintentos nunca entregan QR.
export async function unlinkWhatsApp() {
  const pending = state.connecting;
  const open = state.sock;
  state.manualStop = true;
  if (open) {
    // Si WhatsApp no responde, igual se borra la sesión local (queda un dispositivo
    // huérfano en el teléfono, que se quita desde Dispositivos vinculados).
    await Promise.race([open.logout().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
  }
  stopWhatsApp();
  await pending?.catch(() => {});
  await rm(AUTH_DIR, { recursive: true, force: true });
  state.lastDisconnectReason = null;
  state.lastDisconnectAt = null;
}

async function connect() {
  const {
    default: makeWASocket,
    useMultiFileAuthState: loadAuthState,
    DisconnectReason,
  } = await import("@whiskeysockets/baileys");
  const { state: authState, saveCreds } = await loadAuthState(AUTH_DIR);
  // Se detuvo o desvinculó mientras cargaba: no abrir un socket que vuelva a guardar la sesión.
  if (state.manualStop) return;
  const socket = makeWASocket({ auth: authState });
  console.log(`[whatsapp] abriendo conexión (pid ${process.pid}, intento ${state.retryCount + 1})`);
  state.rawSocket = socket;
  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    void import("@/lib/whatsappChat")
      .then(({ handleIncomingMessage }) => Promise.all(messages.map((m) => handleIncomingMessage(socket, m))))
      .catch((err) => console.error("[whatsapp] no se pudo procesar un mensaje entrante", err));
  });

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      state.status = "connecting";
      state.qrDataUrl = await QRCode.toDataURL(qr);
    }

    if (connection === "open") {
      state.sock = socket;
      state.status = "connected";
      state.qrDataUrl = null;
      state.retryCount = 0;
      state.lastDisconnectReason = null;
      state.lastDisconnectAt = null;
      console.log("[whatsapp] conectado. Elegí el grupo de alertas desde Configuración.");
      // Conectarse (o reconectarse) no es un evento de resumen. El resumen
      // diario lo controla exclusivamente el scheduler en su minuto exacto;
      // de otro modo una acción sin relación —por ejemplo recuperar la
      // contraseña— podía abrir una instancia y disparar un resumen atrasado.
    }

    if (connection === "close") {
      // Un socket viejo puede terminar de cerrar después de que ya exista
      // otro nuevo. No debe tumbar ni cambiar el estado de esa conexión.
      if (state.rawSocket !== socket) return;
      state.sock = null;
      state.rawSocket = null;
      state.qrDataUrl = null;
      if (state.manualStop) {
        state.status = "disconnected";
        return;
      }
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
        ?.statusCode;
      state.lastDisconnectAt = Date.now();
      console.warn(`[whatsapp] conexión cerrada (código ${statusCode ?? "desconocido"}, pid ${process.pid}, intento ${state.retryCount + 1})`);
      state.lastDisconnectReason =
        statusCode === DisconnectReason.loggedOut ? "La sesión se cerró desde el teléfono: hay que escanear el QR de nuevo." : `Se cortó la conexión (código ${statusCode ?? "desconocido"}); reintentando.`;
      if (statusCode === DisconnectReason.loggedOut) {
        state.status = "disconnected";
        // Esas claves ya fueron revocadas por WhatsApp. Conservarlas hace
        // que cada "Conectar" repita el cierre sin entregar QR. Se borran
        // solo tras este motivo inequívoco; una desconexión manual conserva
        // la sesión como antes.
        await rm(AUTH_DIR, { recursive: true, force: true }).catch((err) =>
          console.error("[whatsapp] no se pudo limpiar la sesión revocada", err)
        );
        console.error("[whatsapp] sesión cerrada desde el teléfono, hay que volver a escanear el QR.");
      } else {
        const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** state.retryCount, RETRY_MAX_DELAY_MS);
        state.retryCount++;
        state.status = "connecting";
        state.reconnectTimer = setTimeout(() => {
          state.reconnectTimer = null;
          void startWhatsApp().catch((err) => console.error("[whatsapp] falló el reintento", err));
        }, delay);
      }
    }
  });
}

// Lista los grupos del dispositivo vinculado (consulta en vivo, sin caché):
// alimenta el selector de "grupo de WhatsApp" en Configuración y en cada
// proyecto. Vacío si no hay conexión activa.
export async function listGroups() {
  if (!state.sock) return [];
  const groups = await state.sock.groupFetchAllParticipating();
  return Object.values(groups).map((g) => ({ id: g.id, name: g.subject }));
}

// Best-effort: nunca tira error hacia notify(), si WhatsApp no está
// conectado o falla el envío, la notificación in-app/push sigue intacta.
// El link va al final (después de las menciones) en su propia línea, sin
// nada pegado, para que WhatsApp lo detecte como clickeable. Con `inlineMentions` el cuerpo ya
// trae sus "@teléfono" donde corresponde: no se agrega la línea de menciones al final.
export async function sendGroupAlert(groupJid: string, body: string, userIds: string[] = [], link?: string, inlineMentions = false, urgent = false) {
  if (blockedByTestMode(groupJid)) return false;
  if (!urgent && (await whatsAppLimitReached())) return false;
  if ((await getWhatsAppConnection()) === "cloud") {
    const people = await prisma.user.findMany({ where: { id: { in: userIds }, active: true, phone: { not: null } }, select: { phone: true } });
    const text = `${body}${link ? `\n\n🔗 ${link}` : ""}`;
    let any = false;
    for (const p of people) if (await sendCloudNotice(p.phone!, text)) any = true;
    return any;
  }
  return paced(() => sendGroupAlertNow(groupJid, body, userIds, link, inlineMentions), urgent);
}

async function sendGroupAlertNow(groupJid: string, body: string, userIds: string[], link: string | undefined, inlineMentions: boolean) {
  if (!state.sock) return false;

  try {
    const botName = await getBotName();
    const mentioned = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds }, phone: { not: null } },
          select: { phone: true },
        })
      : [];
    const mentions = mentioned.map((u) => `${u.phone}@s.whatsapp.net`);
    const mentionLine = mentions.length && !inlineMentions ? `\n👤 ${mentions.map((m) => `@${m.split("@")[0]}`).join(" ")}` : "";
    const linkLine = link ? `\n\n🔗 ${link}` : "";
    const text = `🤖 *${botName}*\n${body}${mentionLine}${linkLine}`;

    // Los mensajes de grupo NUNCA llevan la foto de perfil del bot (decisión del
    // administrador): solo texto con el ícono 🤖 + nombre.
    await qrSend(groupJid, { text, mentions });
    return true;
  } catch (err) {
    console.error("[whatsapp] no se pudo enviar la alerta", err);
    return false;
  }
}

// Despacho a un JID ya resuelto (persona o grupo, sin menciones) — usado
// tanto por sendDirectAlert como por el poller (scheduler.ts) al vaciar la
// cola de horario laboral, donde el target ya viene resuelto de antemano.
//
// Solo para JID de persona (no de grupo): la foto de perfil del bot viaja
// ÚNICAMENTE en el primer mensaje que recibe esa persona, junto con un
// mensaje de presentación (quién es el bot, qué hace) — de ahí en más, ya
// la conoce, así que solo se ve el ícono 🤖 + nombre en el texto.
// Imágenes adjuntas de un comentario (rutas /uploads/... en disco, ver
// uploadFile.ts) → buffers listos para mandar como foto real de WhatsApp.
async function loadImageBuffers(urls: string[]) {
  const bufs = await Promise.all(
    urls.map(async (url) => {
      const file = await findUploadPath(url);
      return file ? readFile(file).catch(() => null) : null;
    })
  );
  return bufs.filter((b) => b !== null);
}

// Mensaje de bienvenida por DM: es el ÚNICO mensaje de WhatsApp que lleva la foto de perfil del
// bot. Resuelve de una vez el dato que la persona necesita para entrar. Nunca incluye ni solicita
// contraseña: esa recuperación sigue exclusivamente por el flujo seguro de restablecimiento.
async function sendIntroMessage(jid: string, user: { id: string; username: string }) {
  const [botName, avatar] = await Promise.all([getBotName(), getBotAvatarBuffer()]);
  const introText = `🤖 *${botName}*\n${await getBotIntroMessage()}\n\nTu usuario para entrar es: *${user.username}*. Si olvidaste la contraseña, usá “¿Olvidaste tu contraseña?” en la pantalla de ingreso.`;
  if (avatar) {
    await qrSend(jid, { image: avatar, caption: introText });
  } else {
    await qrSend(jid, { text: introText });
  }
  await prisma.user.update({ where: { id: user.id }, data: { whatsappIntroducedAt: new Date() } });
}

// Reenvío a pedido (desde el chat, solo administrador): la misma bienvenida con foto, aunque la
// persona ya la haya recibido antes.
export async function sendWelcomeMessage(userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, active: true }, select: { id: true, username: true, phone: true } });
  if (!user?.phone) return false;
  const jid = `${user.phone}@s.whatsapp.net`;
  if (blockedByTestMode(jid)) return false;
  if ((await getWhatsAppConnection()) === "cloud") {
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { whatsappLastInboundAt: true } });
    if (!isWindowOpen(fresh?.whatsappLastInboundAt)) {
      await prisma.user.update({ where: { id: user.id }, data: { whatsappIntroducedAt: null } });
      return "pending" as const;
    }
    try {
      await sendCloudIntro(user.phone, user);
      return true;
    } catch {
      return false;
    }
  }
  return paced(async () => {
    if (!state.sock) return false;
    try {
      await sendIntroMessage(jid, user);
      return true;
    } catch (err) {
      console.error("[whatsapp] no se pudo enviar la bienvenida", err);
      return false;
    }
  }, true);
}

export async function sendRawMessage(jid: string, text: string, imageUrls?: string[], urgent = false) {
  if (blockedByTestMode(jid)) return false;
  if (!urgent && (await whatsAppLimitReached())) return false;
  if ((await getWhatsAppConnection()) === "cloud") {
    if (jid.endsWith("@s.whatsapp.net")) return sendCloudNotice(jid.split("@")[0], text, imageUrls);
    const phones = [...new Set([...text.matchAll(/@(\d{8,15})\b/g)].map((m) => m[1]))];
    let any = false;
    for (const phone of phones) if (await sendCloudNotice(phone, text)) any = true;
    return any;
  }
  return paced(() => sendRawMessageNow(jid, text, imageUrls), urgent);
}

async function sendRawMessageNow(jid: string, text: string, imageUrls?: string[]) {
  if (!state.sock) {
    console.error(`[whatsapp] no se pudo enviar a ${jid}: no hay conexión activa.`);
    return false;
  }
  try {
    const [botName, images] = await Promise.all([
      getBotName(),
      imageUrls?.length ? loadImageBuffers(imageUrls) : Promise.resolve([]),
    ]);
    const fullText = `🤖 *${botName}*\n${text}`;
    const isDirect = jid.endsWith("@s.whatsapp.net");
    // Los mensajes de grupo que salen de la cola de horario laboral traen las menciones como
    // "@número" en el texto; sin el arreglo `mentions` WhatsApp las muestra como número pelado
    // en vez del nombre del contacto.
    const mentions = isDirect ? [] : [...text.matchAll(/@(\d{8,15})\b/g)].map((m) => `${m[1]}@s.whatsapp.net`);
    const user = isDirect
      ? await prisma.user.findFirst({
          where: { phone: jid.split("@")[0] },
          select: { id: true, username: true, whatsappIntroducedAt: true },
        })
      : null;

    // Con imágenes adjuntas: la primera va como foto con el texto de caption,
    // el resto (si hay más de una) como fotos sueltas a continuación.
    const sendFullText = async () => {
      if (images.length) {
        await qrSend(jid, { image: images[0], caption: fullText, mentions });
        for (const img of images.slice(1)) await qrSend(jid, { image: img });
      } else {
        await qrSend(jid, { text: fullText, mentions });
      }
    };

    if (user && !user.whatsappIntroducedAt) {
      await sendIntroMessage(jid, user);
      await sendFullText();
      return true;
    }

    // Grupos: nunca la foto del bot, solo texto (ver sendGroupAlert).
    await sendFullText();
    return true;
  } catch (err) {
    console.error(`[whatsapp] no se pudo enviar a ${jid.replace(/^(\d{4})\d+/, "$1***")} (estado ${state.status}, pid ${process.pid})`, err);
    return false;
  }
}

// DM directo a una persona (fono en formato internacional sin "+", ej.
// "573144018901") — usado para las alertas de bajo impacto que le competen
// solo a esa persona.
async function sendCloudNotice(phone: string, text: string, imageUrls?: string[]) {
  const config = await getCloudConfig();
  if (!config) {
    console.error("[whatsapp-cloud] faltan datos de la API oficial; no se envía.");
    return false;
  }
  const user = await prisma.user.findFirst({
    where: { phone, deletedAt: null },
    select: { id: true, name: true, username: true, whatsappLastInboundAt: true, whatsappIntroducedAt: true },
  });
  try {
    if (isWindowOpen(user?.whatsappLastInboundAt)) {
      if (user && !user.whatsappIntroducedAt) await sendCloudIntro(phone, user);
      const fullText = `🤖 *${await getBotName()}*\n${text}`;
      const images = (imageUrls?.length ? await loadImageBuffers(imageUrls) : []).flatMap((buffer) => {
        const mime = cloudImageMime(buffer);
        return mime ? [{ buffer, mime }] : [];
      });
      if (images.length) {
        await cloudSendImage(config, phone, images[0].buffer, images[0].mime, fullText);
        for (const img of images.slice(1)) await cloudSendImage(config, phone, img.buffer, img.mime);
      } else {
        await cloudSendText(config, phone, fullText);
      }
    } else {
      await cloudSendTemplate(config, phone, [user?.name ?? "equipo", oneLineSummary(text), noticeLink(text, absoluteUrl("/dashboard") ?? "")]);
    }
    return true;
  } catch {
    return false;
  }
}

async function sendCloudIntro(phone: string, user: { id: string; username: string }) {
  const config = await getCloudConfig();
  if (!config) return;
  const [botName, avatar] = await Promise.all([getBotName(), getBotAvatarBuffer()]);
  const introText = `🤖 *${botName}*\n${await getBotIntroMessage()}\n\nTu usuario para entrar es: *${user.username}*. Si olvidaste la contraseña, usá “¿Olvidaste tu contraseña?” en la pantalla de ingreso.`;
  const avatarMime = avatar ? cloudImageMime(avatar) : null;
  if (avatar && avatarMime) await cloudSendImage(config, phone, avatar, avatarMime, introText);
  else await cloudSendText(config, phone, introText);
  await prisma.user.update({ where: { id: user.id }, data: { whatsappIntroducedAt: new Date() } });
}

export async function sendCloudChatIntroIfNeeded(phone: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, whatsappIntroducedAt: true } });
  if (user && !user.whatsappIntroducedAt) await sendCloudIntro(phone, user);
}

export async function sendDirectAlert(phone: string, text: string, imageUrls?: string[], urgent = false) {
  return sendRawMessage(`${phone}@s.whatsapp.net`, text, imageUrls, urgent);
}

export function getChatSocket() {
  return state.sock;
}

export async function sendChatReply(jid: string, userId: string, parts: string[], files: { url: string; name: string }[] = []) {
  if (!state.sock || blockedByTestMode(jid)) return false;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, whatsappIntroducedAt: true } });
    if (user && !user.whatsappIntroducedAt) await sendIntroMessage(jid, user);
    for (const text of parts) await qrSend(jid, { text });
    for (const file of files) {
      const filePath = await findUploadPath(file.url);
      if (!filePath) continue;
      const buffer = await readFile(filePath).catch(() => null);
      if (!buffer) continue;
      await qrSend(jid, { document: buffer, fileName: file.name, mimetype: mimeFromFileName(file.name, file.url) || "application/octet-stream" });
    }
    return true;
  } catch (err) {
    console.error("[whatsapp] no se pudo enviar la respuesta del chat", err);
    return false;
  }
}

export async function sendConfirmPoll(jid: string, question: string, options: [string, string]) {
  if (!state.sock || blockedByTestMode(jid)) return null;
  try {
    return (await qrSend(jid, { poll: { name: question, values: options, selectableCount: 1 } })) ?? null;
  } catch (err) {
    console.error("[whatsapp] no se pudo enviar la encuesta de confirmación", err);
    return null;
  }
}
