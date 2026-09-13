import type { WASocket } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getBotName, getBotAvatarBuffer } from "@/lib/botSettings";

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
  };
if (process.env.NODE_ENV !== "production") globalForWhatsApp.whatsapp = state;

// Tope de reintentos automáticos: si el socket se cae seguido (no por logout
// explícito), reintentamos unas pocas veces y después paramos — así el admin
// recupera el control (botón "Conectar"/"Desconectar") en vez de quedar en
// un loop infinito de "Conectando…".
const MAX_AUTO_RETRIES = 2;
// ponytail: espera fija de 2s antes de cada reintento (no backoff
// exponencial) — alcanza para no golpear como abuso a ojos de WhatsApp;
// subir a backoff creciente si algún día vuelve a haber flapping real.
const RETRY_DELAY_MS = 2000;

export function getWhatsAppStatus() {
  return { status: state.status, qrDataUrl: state.qrDataUrl };
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
  const { state: authState, saveCreds } = await loadAuthState(".baileys-auth");
  const socket = makeWASocket({ auth: authState });
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
      console.log("[whatsapp] conectado. Elegí el grupo de alertas desde Configuración.");
    }

    if (connection === "close") {
      state.sock = null;
      state.rawSocket = null;
      state.qrDataUrl = null;
      if (state.manualStop) {
        state.status = "disconnected";
        return;
      }
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
        ?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        state.status = "disconnected";
        console.error("[whatsapp] sesión cerrada desde el teléfono, hay que volver a escanear el QR.");
      } else if (state.retryCount < MAX_AUTO_RETRIES) {
        state.retryCount++;
        state.status = "connecting";
        setTimeout(() => void startWhatsApp(), RETRY_DELAY_MS);
      } else {
        state.status = "disconnected";
        console.error(`[whatsapp] no se pudo reconectar después de ${MAX_AUTO_RETRIES} intentos, hace falta reconectar a mano desde Configuración.`);
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
  if (!state.sock) return;

  try {
    const [botName, avatar] = await Promise.all([getBotName(), getBotAvatarBuffer()]);
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

    // Punto 5: se manda la foto de perfil del bot junto al texto (como
    // caption) para que se identifique de un vistazo quién escribe — mismo
    // mensaje, un solo envío, sin depender de convertir nada a webp.
    if (avatar) {
      await state.sock.sendMessage(groupJid, { image: avatar, caption: text, mentions });
    } else {
      await state.sock.sendMessage(groupJid, { text, mentions });
    }
  } catch (err) {
    console.error("[whatsapp] no se pudo enviar la alerta", err);
  }
}

// Despacho a un JID ya resuelto (persona o grupo, sin menciones) — usado
// tanto por sendDirectAlert como por el poller (scheduler.ts) al vaciar la
// cola de horario laboral, donde el target ya viene resuelto de antemano.
export async function sendRawMessage(jid: string, text: string) {
  if (!state.sock) {
    console.error(`[whatsapp] no se pudo enviar a ${jid}: no hay conexión activa.`);
    return false;
  }
  try {
    const [botName, avatar] = await Promise.all([getBotName(), getBotAvatarBuffer()]);
    const fullText = `🤖 *${botName}*\n${text}`;
    if (avatar) {
      await state.sock.sendMessage(jid, { image: avatar, caption: fullText });
    } else {
      await state.sock.sendMessage(jid, { text: fullText });
    }
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
