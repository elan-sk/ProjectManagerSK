import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { isCurrentlyWorkingHour } from "@/lib/workingHours";

webpush.setVapidDetails(
  "mailto:ecovia2@gmail.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// Fuera del horario laboral (el de WhatsApp) no sale push: el aviso queda igual en la
// campana. `immediate` (tarea urgente) ignora el horario, como en WhatsApp.
export async function sendPushToUser(userId: string, title: string, url?: string, immediate = false) {
  if (!immediate && !(await isCurrentlyWorkingHour())) return;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, url: url ?? "/projects" })
        );
      } catch (err) {
        // ponytail: una suscripción muerta (410 Gone) es normal cuando el
        // navegador la revoca; se limpia sola en vez de reintentar.
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
      }
    })
  );
}
