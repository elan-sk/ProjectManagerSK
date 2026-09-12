import type { WASocket } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getBotName } from "@/lib/botSettings";

// Alertas de WhatsApp vía sesión personal (estilo WhatsApp Web, no la API
// oficial de Meta) — ver AGENTS.md. Se conecta una sola vez (al bootear el
// server si WHATSAPP_ENABLED=true, o a pedido desde el botón de un admin en
// Configuración) y queda escuchando en este módulo.
let sock: WASocket | null = null;
let rawSocket: WASocket | null = null;
let connecting: Promise<void> | null = null;

// Tope de reintentos automáticos: si el socket se cae seguido (no por logout
// explícito), reintentamos unas pocas veces y después paramos — así el admin
// recupera el control (botón "Conectar"/"Desconectar") en vez de quedar en
// un loop infinito de "Conectando…".
const MAX_AUTO_RETRIES = 2;
let retryCount = 0;
let manualStop = false;

export type WhatsAppStatus = "disconnected" | "connecting" | "connected";
let status: WhatsAppStatus = "disconnected";
let qrDataUrl: string | null = null;

export function getWhatsAppStatus() {
  return { status, qrDataUrl };
}

export function startWhatsApp() {
  if (sock || connecting) return connecting ?? Promise.resolve();
  manualStop = false;
  connecting = connect().finally(() => {
    connecting = null;
  });
  return connecting;
}

// Corta la conexión a mano (no es logout: las credenciales en .baileys-auth
// quedan intactas, así que "Conectar WhatsApp" después reconecta sin QR).
export function stopWhatsApp() {
  manualStop = true;
  retryCount = 0;
  connecting = null;
  void rawSocket?.end(undefined);
  rawSocket = null;
  sock = null;
  qrDataUrl = null;
  status = "disconnected";
}

async function connect() {
  const {
    default: makeWASocket,
    useMultiFileAuthState: loadAuthState,
    DisconnectReason,
  } = await import("@whiskeysockets/baileys");
  const { state, saveCreds } = await loadAuthState(".baileys-auth");
  const socket = makeWASocket({ auth: state });
  rawSocket = socket;
  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      status = "connecting";
      qrDataUrl = await QRCode.toDataURL(qr);
    }

    if (connection === "open") {
      sock = socket;
      status = "connected";
      qrDataUrl = null;
      retryCount = 0;
      console.log("[whatsapp] conectado. Elegí el grupo de alertas desde Configuración.");
    }

    if (connection === "close") {
      sock = null;
      rawSocket = null;
      qrDataUrl = null;
      if (manualStop) {
        status = "disconnected";
        return;
      }
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
        ?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        status = "disconnected";
        console.error("[whatsapp] sesión cerrada desde el teléfono, hay que volver a escanear el QR.");
      } else if (retryCount < MAX_AUTO_RETRIES) {
        retryCount++;
        status = "connecting";
        void startWhatsApp();
      } else {
        status = "disconnected";
        console.error(`[whatsapp] no se pudo reconectar después de ${MAX_AUTO_RETRIES} intentos, hace falta reconectar a mano desde Configuración.`);
      }
    }
  });
}

// Lista los grupos del dispositivo vinculado (consulta en vivo, sin caché):
// alimenta el selector de "grupo de WhatsApp" en Configuración y en cada
// proyecto. Vacío si no hay conexión activa.
export async function listGroups() {
  if (!sock) return [];
  const groups = await sock.groupFetchAllParticipating();
  return Object.values(groups).map((g) => ({ id: g.id, name: g.subject }));
}

// Best-effort: nunca tira error hacia notify(), si WhatsApp no está
// conectado o falla el envío, la notificación in-app/push sigue intacta.
// El link va al final (después de las menciones) en su propia línea, sin
// nada pegado, para que WhatsApp lo detecte como clickeable.
export async function sendGroupAlert(groupJid: string, body: string, userIds: string[] = [], link?: string) {
  if (!sock) return;

  try {
    const botName = await getBotName();
    const mentioned = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds }, phone: { not: null } },
          select: { phone: true },
        })
      : [];
    const mentions = mentioned.map((u) => `${u.phone}@s.whatsapp.net`);
    const mentionLine = mentions.length ? `\n👤 ${mentions.map((m) => `@${m.split("@")[0]}`).join(" ")}` : "";
    const linkLine = link ? `\n\n🔗 ${link}` : "";

    await sock.sendMessage(groupJid, {
      text: `🤖 *${botName}*\n${body}${mentionLine}${linkLine}`,
      mentions,
    });
  } catch (err) {
    console.error("[whatsapp] no se pudo enviar la alerta", err);
  }
}

// Despacho a un JID ya resuelto (persona o grupo, sin menciones) — usado
// tanto por sendDirectAlert como por el poller (scheduler.ts) al vaciar la
// cola de horario laboral, donde el target ya viene resuelto de antemano.
export async function sendRawMessage(jid: string, text: string) {
  if (!sock) return false;
  try {
    const botName = await getBotName();
    await sock.sendMessage(jid, { text: `🤖 *${botName}*\n${text}` });
    return true;
  } catch (err) {
    console.error("[whatsapp] no se pudo enviar el mensaje", err);
    return false;
  }
}

// DM directo a una persona (fono en formato internacional sin "+", ej.
// "573144018901") — usado para las alertas de bajo impacto que le competen
// solo a esa persona.
export async function sendDirectAlert(phone: string, text: string) {
  return sendRawMessage(`${phone}@s.whatsapp.net`, text);
}
