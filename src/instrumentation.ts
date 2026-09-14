export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensurePersistentUploads } = await import("@/lib/persistentUploads");
  await ensurePersistentUploads().catch((err) => console.error("[instrumentation] ensurePersistentUploads falló", err));

  if (process.env.WHATSAPP_ENABLED === "true") {
    const { startWhatsApp } = await import("@/lib/whatsapp");
    // Mismo criterio que scheduler.ts: si falla la conexión, que quede en
    // el log, no que tumbe el arranque de todo el server.
    startWhatsApp().catch((err) => console.error("[instrumentation] startWhatsApp falló", err));
  }

  // Poller de escalamiento (cola de horario laboral + recordatorios de
  // reunión) — arranca siempre: si WhatsApp se conecta después a mano desde
  // Configuración, ya lo encuentra corriendo.
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
