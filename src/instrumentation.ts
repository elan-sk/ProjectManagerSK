export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Primero: todo lo que se escriba con console.* queda también en el archivo de registro (logger.ts).
  const { installConsoleCapture, logDir } = await import("@/lib/logger");
  installConsoleCapture();
  console.log(`[arranque] servidor iniciado (pid ${process.pid}, registro en ${logDir()}, WHATSAPP_ENABLED=${process.env.WHATSAPP_ENABLED ?? "sin definir"})`);

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

// Errores de peticiones (páginas, rutas y acciones de servidor) al registro, con la ruta afectada.
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath: string; routeType: string }) {
  const { logger } = await import("@/lib/logger");
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  logger.error("peticion", err instanceof Error ? (err.stack ?? err.message) : String(err), {
    path: request.path.split("?")[0],
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    digest,
  });
}
