import { existsSync } from "node:fs";
import { commentText, commentWhere, urgentText } from "../src/lib/notifications";

// Vista previa de los mensajes de WhatsApp de menciones, comentarios y urgentes.
//   npx tsx scripts/preview-wa-messages.mts          → los imprime
//   npx tsx scripts/preview-wa-messages.mts --send   → los manda a TU chat propio ("Mensajes para ti"), nunca a otra persona ni al grupo
const link = (p: string) => `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}${p}`;
const messages = [
  commentText("mention", "Ana Gómez", commentWhere("Cafexport", "Reunión con el cliente"), "@Elan revisá por favor el borrador antes del jueves", link("/projects/ID/tasks/ID#internal-conversation")),
  commentText("comment", "Ana Gómez", commentWhere("Cafexport", "Reunión con el cliente"), "Ya subí la versión final del acta.", link("/projects/ID/tasks/ID#internal-conversation")),
  commentText("comment", "Ana Gómez", commentWhere("Cafexport"), "Cambió el alcance de la fase 2.", link("/projects/ID?view=conversation#internal-conversation")),
  urgentText("Reunión con el cliente", "Cafexport", link("/projects/ID/tasks/ID")),
];
for (const m of messages) console.log(`\n${m}\n${"─".repeat(30)}`);

if (process.argv.includes("--send")) {
  if (!existsSync(".baileys-auth")) throw new Error("WhatsApp no está vinculado (falta .baileys-auth).");
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
  const me = jidNormalizedUser(sock.user!.id);
  for (const m of messages) {
    await sock.sendMessage(me, { text: `🤖 *ProjectManagerSK*\n${m}` });
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log("\nEnviados a tu chat propio.");
  await sock.end(undefined);
}
process.exit(0);
