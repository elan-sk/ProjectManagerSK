import makeWASocket, { useMultiFileAuthState as loadAuthState, jidNormalizedUser } from "@whiskeysockets/baileys";
import { prisma } from "../src/lib/prisma";

// Prueba puntual (correr con `npx tsx scripts/whatsapp-message-examples.mts`,
// con NODE_OPTIONS=--dns-result-order=ipv4first si la red tiene IPv6 roto):
// manda al chat propio ("Mensajes para ti") un ejemplo de cada tipo de
// alerta del escalamiento (ver notifications.ts) con el mismo formato exacto
// que usará la app (semáforo por severidad + emojis + link al final), para
// juntar feedback antes de darlo por terminado. Las alertas "grupales" acá
// se mandan igual por DM/self-chat (aclarado en el texto) — en producción
// van al grupo de WhatsApp del proyecto.
async function main() {
  const max = await prisma.user.findFirstOrThrow({ where: { name: { contains: "max" } }, select: { phone: true } });

  const task = await prisma.task.findFirstOrThrow({ select: { id: true, title: true, projectId: true } });
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = `${base}/projects/${task.projectId}/tasks/${task.id}`;

  const examples = [
    `🔵 *Nueva asignación*\nTe asignaron la tarea "${task.title}"\n\n🔗 ${url}`,
    `🟡 *Por vencer*\n"${task.title}" vence el 15/09/2026.\n\n🔗 ${url}`,
    `🔴 *Tarea vencida* (grupo simulado)\n"${task.title}" está vencida (debía terminar el 10/09/2026).\n👤 @${max.phone}\n\n🔗 ${url}`,
    `🔴 *Tarea bloqueada* (grupo simulado)\nLa tarea "${task.title}" fue marcada como bloqueada\n👤 @${max.phone}\n\n🔗 ${url}`,
    `🟠 *Tarea devuelta* (grupo simulado)\nLa tarea "${task.title}" fue devuelta en revisión\n👤 @${max.phone}\n\n🔗 ${url}`,
    `📅 *Recordatorio de reunión* (grupo simulado)\n"${task.title}"\n🕐 lunes, 14 de septiembre, 7:00 a.m.\n👤 @${max.phone}\n\n🔗 https://meet.google.com/ejemplo-reunion`,
    // Diagnóstico: comparar si WhatsApp reconoce como clickeable un link con
    // dominio real (con punto/TLD) vs uno con "localhost" (sin punto) — para
    // confirmar si el problema reportado es específico del entorno local.
    `🧪 *Diagnóstico de links* — ¿cuál de estos dos se ve azul/subrayado (clickeable)?\n\nCon dominio real:\n🔗 https://www.google.com\n\nCon localhost (como en desarrollo):\n🔗 ${url}`,
  ];

  const { state, saveCreds } = await loadAuthState(".baileys-auth");
  const sock = makeWASocket({ auth: state });
  sock.ev.on("creds.update", saveCreds);

  await new Promise<void>((resolve, reject) => {
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") resolve();
      if (connection === "close") reject(lastDisconnect?.error ?? new Error("conexión cerrada"));
    });
  });

  const selfJid = jidNormalizedUser(sock.user!.id);
  for (const text of examples) {
    await sock.sendMessage(selfJid, { text: `🤖 *ProjectManagerSK*\n${text}` });
    console.log("Enviado:", text.split("\n")[0]);
  }

  await sock.end(undefined);
}

main()
  .catch((err) => {
    console.error("FALLÓ:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
