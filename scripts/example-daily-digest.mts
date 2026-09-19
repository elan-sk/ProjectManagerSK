import { existsSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { buildDailyDigestText } from "../src/lib/notifications";

// Ejemplo REAL del resumen diario (con la barra de avance de 10 bloques y los
// datos de tu base actual), sin esperar a la hora programada.
//
//   npm run example:digest                    → lo imprime en la terminal
//   npm run example:digest -- --user=elan-sk  → como lo vería otra persona
//   npm run example:digest -- --send          → además te lo manda a TU propio
//                                               chat de WhatsApp ("Mensajes para ti")
//
// --send usa la sesión vinculada en .baileys-auth (la que crea Configuración →
// WhatsApp al escanear el QR) y SOLO escribe a tu propio número: nunca al
// grupo ni a otra persona. Si tu red tiene IPv6 roto: NODE_OPTIONS=--dns-result-order=ipv4first
async function main() {
  const args = process.argv.slice(2);
  const send = args.includes("--send");
  const username = args.find((a) => a.startsWith("--user="))?.slice("--user=".length);

  const user = username
    ? await prisma.user.findUnique({ where: { username } })
    : await prisma.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" } });
  if (!user) throw new Error(username ? `No existe el usuario "${username}".` : "No hay ningún administrador activo.");

  const text = await buildDailyDigestText(user.id, user.name);
  console.log(`\n--- Resumen diario de ${user.name} (${user.username}) ---\n`);
  console.log(text);
  console.log("\n--- fin ---");

  if (!send) {
    console.log("\nSolo lo imprimí. Para recibirlo en tu WhatsApp: npm run example:digest -- --send");
    return;
  }

  if (!existsSync(".baileys-auth")) {
    throw new Error(
      "WhatsApp no está vinculado en esta instalación (falta la carpeta .baileys-auth). " +
        "Vincúlalo en Configuración → WhatsApp (QR) y vuelve a correr con --send."
    );
  }

  const { default: makeWASocket, useMultiFileAuthState, jidNormalizedUser } = await import("@whiskeysockets/baileys");
  const { state, saveCreds } = await useMultiFileAuthState(".baileys-auth");
  const sock = makeWASocket({ auth: state });
  sock.ev.on("creds.update", saveCreds);
  await new Promise<void>((resolve, reject) => {
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "open") resolve();
      if (connection === "close") reject(lastDisconnect?.error ?? new Error("conexión cerrada"));
    });
  });

  // Siempre el chat propio de la sesión vinculada — nunca un grupo.
  await sock.sendMessage(jidNormalizedUser(sock.user!.id), { text: `🤖 *ProjectManagerSK*\n${text}` });
  console.log("Enviado a tu chat de WhatsApp (\"Mensajes para ti\").");
  await sock.end(undefined);
}

main()
  .catch((err) => {
    console.error("FALLÓ:", (err as Error).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
