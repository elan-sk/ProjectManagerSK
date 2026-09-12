import makeWASocket, { useMultiFileAuthState as loadAuthState, jidNormalizedUser } from "@whiskeysockets/baileys";

// Prueba puntual: manda un mensaje al chat "Mensajes para ti" de la propia
// cuenta vinculada (no a un contacto) — confirma que sock.sendMessage al
// propio JID normalizado funciona igual que a cualquier otro chat.
async function main() {
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
  await sock.sendMessage(selfJid, { text: "🤖 *ProjectManagerSK*\nPrueba: mensaje al chat \"Mensajes para ti\"." });
  console.log(`OK: mensaje enviado a mí mismo (${selfJid}).`);

  await sock.end(undefined);
}

main()
  .catch((err) => {
    console.error("FALLÓ:", err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
