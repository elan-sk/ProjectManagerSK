export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.WHATSAPP_ENABLED === "true") {
    const { startWhatsApp } = await import("@/lib/whatsapp");
    void startWhatsApp();
  }

  // Poller de escalamiento (cola de horario laboral + recordatorios de
  // reunión) — arranca siempre: si WhatsApp se conecta después a mano desde
  // Configuración, ya lo encuentra corriendo.
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
