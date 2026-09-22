import type { WASocket } from "@whiskeysockets/baileys";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getBotName, getBotAvatarBuffer, getBotIntroMessage } from "@/lib/botSettings";

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

// Modo prueba: con WHATSAPP_ONLY_PHONE definido (solo en desarrollo), ÚNICAMENTE ese número puede
// recibir mensajes; todo lo demás (otras personas y grupos) se descarta. En producción no se define.
const blockedLogged = new Set<string>();
function blockedByTestMode(jid: string) {
  const only = process.env.WHATSAPP_ONLY_PHONE?.trim();
  if (!only || jid === `${only}@s.whatsapp.net`) return false;
  if (!blockedLogged.has(jid)) {
    blockedLogged.add(jid);
    console.warn(`[whatsapp] modo prueba (WHATSAPP_ONLY_PHONE): no se envía a ${jid}; solo se permite ${only}.`);
  }
  return true;
}

export function getWhatsAppStatus() {
  return { status: state.status, qrDataUrl: state.qrDataUrl };
}

// Salud de la conexión para la alarma del header (solo admin). `expected` =
// se espera que esté conectado (hay sesión guardada o se conectó a mano y no
// se detuvo a propósito); si no, no hay nada que alarmar.
export function getWhatsAppHealth() {
  const hasSession = existsSync(path.join(AUTH_DIR, "creds.json"));
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
export function ensureWhatsAppAlive() {
  if (state.manualStop || state.sock || state.connecting || state.reconnectTimer) return;
  if (!existsSync(path.join(AUTH_DIR, "creds.json"))) return;
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

async function connect() {
  const {
    default: makeWASocket,
    useMultiFileAuthState: loadAuthState,
    DisconnectReason,
  } = await import("@whiskeysockets/baileys");
  const { state: authState, saveCreds } = await loadAuthState(AUTH_DIR);
  const socket = makeWASocket({ auth: authState });
  console.log(`[whatsapp] abriendo conexión (pid ${process.pid}, intento ${state.retryCount + 1})`);
  state.rawSocket = socket;
  socket.ev.on("creds.update", saveCreds);

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
// nada pegado, para que WhatsApp lo detecte como clickeable.
export async function sendGroupAlert(groupJid: string, body: string, userIds: string[] = [], link?: string) {
  if (!state.sock || blockedByTestMode(groupJid)) return false;

  try {
    const [botName, avatar, intro] = await Promise.all([
      getBotName(),
      getBotAvatarBuffer(),
      prisma.whatsAppGroupIntro.findUnique({ where: { groupJid } }),
    ]);
    const mentioned = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds }, phone: { not: null } },
          select: { phone: true },
        })
      : [];
    const mentions = mentioned.map((u) => `${u.phone}@s.whatsapp.net`);
    const mentionLine = mentions.length ? `\n👤 ${mentions.map((m) => `@${m.split("@")[0]}`).join(" ")}` : "";
    const linkLine = link ? `\n\n🔗 ${link}` : "";
    const text = `🤖 *${botName}*\n${body}${mentionLine}${linkLine}`;

    // Punto 5: la foto de perfil del bot va junto al texto (como caption)
    // solo la primera vez que se le escribe a este grupo — WhatsApp la
    // cachea con esa primera aparición y no la vuelve a mostrar aunque se
    // reenvíe, así que mandarla de nuevo en cada alerta es puro desperdicio.
    if (avatar && !intro) {
      await state.sock.sendMessage(groupJid, { image: avatar, caption: text, mentions });
      await prisma.whatsAppGroupIntro.create({ data: { groupJid } });
    } else {
      await state.sock.sendMessage(groupJid, { text, mentions });
    }
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
export async function sendRawMessage(jid: string, text: string) {
  if (blockedByTestMode(jid)) return false;
  if (!state.sock) {
    console.error(`[whatsapp] no se pudo enviar a ${jid}: no hay conexión activa.`);
    return false;
  }
  try {
    const [botName, avatar] = await Promise.all([getBotName(), getBotAvatarBuffer()]);
    const fullText = `🤖 *${botName}*\n${text}`;
    const isDirect = jid.endsWith("@s.whatsapp.net");
    const user = isDirect
      ? await prisma.user.findFirst({
          where: { phone: jid.split("@")[0] },
          select: { id: true, username: true, whatsappIntroducedAt: true },
        })
      : null;

    if (user && !user.whatsappIntroducedAt) {
      // La presentación resuelve de una vez el dato que la persona necesita
      // para entrar. Nunca incluye ni solicita contraseña: esa recuperación
      // sigue exclusivamente por el flujo seguro de restablecimiento.
      const introText = `🤖 *${botName}*\n${await getBotIntroMessage()}\n\nTu usuario para entrar es: *${user.username}*. Si olvidaste la contraseña, usá “¿Olvidaste tu contraseña?” en la pantalla de ingreso.`;
      if (avatar) {
        await state.sock.sendMessage(jid, { image: avatar, caption: introText });
      } else {
        await state.sock.sendMessage(jid, { text: introText });
      }
      await prisma.user.update({ where: { id: user.id }, data: { whatsappIntroducedAt: new Date() } });
      await state.sock.sendMessage(jid, { text: fullText });
      return true;
    }

    if (isDirect || !avatar) {
      await state.sock.sendMessage(jid, { text: fullText });
    } else {
      await state.sock.sendMessage(jid, { image: avatar, caption: fullText });
    }
    return true;
  } catch (err) {
    console.error(`[whatsapp] no se pudo enviar a ${jid.replace(/^(\d{4})\d+/, "$1***")} (estado ${state.status}, pid ${process.pid})`, err);
    return false;
  }
}

// DM directo a una persona (fono en formato internacional sin "+", ej.
// "573144018901") — usado para las alertas de bajo impacto que le competen
// solo a esa persona.
export async function sendDirectAlert(phone: string, text: string) {
  return sendRawMessage(`${phone}@s.whatsapp.net`, text);
}
