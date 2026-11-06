import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isGoogleCalendarConfigured } from "@/lib/googleCalendar";
import { SettingsCard } from "../SettingsCard";

export default async function IntegrationsSettingsPage({ searchParams }: { searchParams: Promise<{ google_calendar?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { google_calendar } = await searchParams;
  const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId: session.user.id } });
  const googleConfigured = isGoogleCalendarConfigured();
  return (
    <SettingsCard title="Google Calendar">
        {google_calendar === "connected" && (
          <p className="text-sm text-emerald-600">Se conectó correctamente.</p>
        )}
        {google_calendar === "error" && (
          <p className="text-sm text-red-600">No se pudo conectar, intentá de nuevo.</p>
        )}

        {!googleConfigured && (
          <p className="text-sm text-amber-600">
            Todavía no está configurado GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en el .env del
            servidor. Pedile a quien administra el despliegue que los agregue (ver README).
          </p>
        )}

        {googleConfigured && connection && (
          <p className="text-sm text-slate-600">
            Conectado — cualquier tarea se puede agregar a tu calendario desde su página de
            detalle.
          </p>
        )}

        {googleConfigured && !connection && (
          <a
            href="/api/google-calendar/connect"
            className="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Conectar Google Calendar
          </a>
        )}
    </SettingsCard>
  );
}
