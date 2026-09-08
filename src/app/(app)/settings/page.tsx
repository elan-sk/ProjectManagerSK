import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { ProfileForm } from "./ProfileForm";
import { UsersAdmin } from "./UsersAdmin";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    google_calendar?: string;
    imported?: string;
    importFailed?: string;
    importError?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { google_calendar, imported, importFailed, importError } = await searchParams;
  const isAdmin = session.user.role === "ADMIN";
  const [me, connection, users, projects] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { name: true, email: true, avatarUrl: true },
    }),
    prisma.googleCalendarConnection.findUnique({ where: { userId: session.user.id } }),
    isAdmin
      ? prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true, avatarUrl: true } })
      : Promise.resolve(null),
    isAdmin ? prisma.project.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve(null),
  ]);
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Mi cuenta</h2>
        <ProfileForm name={me.name} email={me.email} avatarUrl={me.avatarUrl} />
        <hr className="border-slate-100" />
        <ChangePasswordForm />
      </section>

      {users && <UsersAdmin users={users} />}

      {projects && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Exportar / Importar datos</h2>
          <p className="text-xs text-slate-400">
            Backup técnico (JSON) de proyecto(s): fases, tareas, asignados, checklist y dependencias. No incluye
            archivos adjuntos ni notificaciones. Importar siempre CREA proyectos nuevos — nunca sobrescribe uno
            existente, aunque el nombre coincida.
          </p>

          {imported !== undefined && (
            <p className="text-sm text-emerald-600">
              Se importaron {imported} proyecto(s).
              {importFailed && <span className="mt-1 block text-red-600">Fallaron: {importFailed}</span>}
            </p>
          )}
          {importError && <p className="text-sm text-red-600">{importError}</p>}

          <div className="space-y-2">
            <p className="text-sm text-slate-600">Exportar</p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/api/export"
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Todos los proyectos
              </a>
            </div>
            {projects.length > 0 && (
              <form action="/api/export" method="get" className="space-y-2">
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5 text-sm text-slate-600">
                      <input type="checkbox" name="projectIds" value={p.id} className="rounded border-slate-300" />
                      <span className="truncate">{p.name}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Exportar seleccionados
                </button>
              </form>
            )}
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-sm text-slate-600">Importar</p>
            <form action="/api/import" method="post" encType="multipart/form-data" className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                name="file"
                accept="application/json"
                required
                className="text-sm text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Importar
              </button>
            </form>
          </div>
        </section>
      )}

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
