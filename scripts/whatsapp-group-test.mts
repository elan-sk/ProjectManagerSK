import makeWASocket, { useMultiFileAuthState as loadAuthState } from "@whiskeysockets/baileys";
import { prisma } from "../src/lib/prisma";

// Prueba puntual (correr con `npx tsx scripts/whatsapp-group-test.mts`, con
// NODE_OPTIONS=--dns-result-order=ipv4first si la red tiene IPv6 roto): manda
// al grupo configurado en AppSetting.whatsappGroupJid (el "grupo de prueba"
// que el usuario acaba de fijar desde Configuración) una alerta con el mismo
// formato y mecanismo de mención real (array `mentions` de Baileys, no solo
// texto "@numero") que usa notify() en producción — para confirmar que la
// mención resalta de verdad dentro de un grupo real.
async function main() {
  const setting = await prisma.appSetting.findUniqueOrThrow({ where: { id: "app" } });
  if (!setting.whatsappGroupJid) throw new Error("No hay grupo configurado en Configuración.");

  const max = await prisma.user.findFirstOrThrow({ where: { name: { contains: "max" } }, select: { name: true, phone: true } });
  if (!max.phone) throw new Error(`${max.name} no tiene teléfono cargado.`);

  const task = await prisma.task.findFirstOrThrow({ select: { id: true, title: true, projectId: true } });
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = `${base}/projects/${task.projectId}/tasks/${task.id}`;
  const maxJid = `${max.phone}@s.whatsapp.net`;

  const { state, saveCreds } = await loadAuthState(".baileys-auth");
  const sock = makeWASocket({ auth: state });
  sock.ev.on("creds.update", saveCreds);

  await new Promise<void>((resolve, reject) => {
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") resolve();
      if (connection === "close") reject(lastDisconnect?.error ?? new Error("conexión cerrada"));
    });
  });

  await sock.sendMessage(setting.whatsappGroupJid, {
    text: `🤖 *ProjectManagerSK*\n🔴 *Tarea bloqueada*\nLa tarea "${task.title}" fue marcada como bloqueada\n👤 @${max.phone}\n\n🔗 ${url}`,
    mentions: [maxJid],
  });
  console.log(`OK: mensaje enviado al grupo ${setting.whatsappGroupJid} mencionando a ${max.name} (${max.phone}).`);

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
