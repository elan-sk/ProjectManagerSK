import makeWASocket, { useMultiFileAuthState as loadAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { prisma } from "../src/lib/prisma";

// Prueba puntual de conexión (correr una vez con `npx tsx scripts/whatsapp-test.ts`):
// conecta como dispositivo vinculado (primera vez pide escanear QR, después
// reutiliza la sesión en .baileys-auth/ — la misma que usa la app en
// producción) y manda un DM de prueba al usuario "Max". No usa el grupo.
async function main() {
  // SQLite: LIKE ya es case-insensitive para ASCII, no hace falta "mode".
  const max = await prisma.user.findFirstOrThrow({
    where: { name: { contains: "max" } },
    select: { name: true, phone: true },
  });
  if (!max.phone) throw new Error(`${max.name} no tiene teléfono cargado en Configuración.`);

  const { state, saveCreds } = await loadAuthState(".baileys-auth");
  const sock = makeWASocket({ auth: state });
  sock.ev.on("creds.update", saveCreds);

  await new Promise<void>((resolve, reject) => {
    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        console.log("Escaneá este QR con WhatsApp (Dispositivos vinculados) — expira en unos segundos:");
        console.log(await QRCode.toString(qr, { type: "terminal", small: true }));
      }
      if (connection === "open") resolve();
      if (connection === "close") reject(lastDisconnect?.error ?? new Error("conexión cerrada"));
    });
  });

  await sock.sendMessage(`${max.phone}@s.whatsapp.net`, {
    text: `🤖 *ProjectManagerSK*\nMensaje de prueba para ${max.name}.`,
  });
  console.log(`OK: mensaje enviado a ${max.name} (${max.phone}).`);

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
