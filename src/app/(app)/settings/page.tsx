import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google_calendar?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { google_calendar } = await searchParams;
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { userId: session.user.id },
  });
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Google Calendar</h2>

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
            Conectado — las tareas de tipo Reunión/Hito se pueden agregar a tu calendario desde
            su página de detalle.
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
      </section>
    </div>
  );
}
