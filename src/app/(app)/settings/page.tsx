import Link from "next/link";
import { visibleProjectWhere } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { ProfileForm } from "./ProfileForm";
import { UsersAdmin } from "./UsersAdmin";
import { CountrySettingForm } from "./CountrySettingForm";
import { getAppCountryCode, getWhatsAppSettings } from "@/lib/appSettings";
import { getBotSettings } from "@/lib/botSettings";
import { getAvailableCountries } from "@/lib/holidays";
import { WhatsAppConnectPanel } from "./WhatsAppConnectPanel";
import { BotSettingsForm } from "./BotSettingsForm";
import { FullBackupPanel } from "./FullBackupPanel";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    google_calendar?: string;
    imported?: string;
    usersCreated?: string;
    importFailed?: string;
    importError?: string;
    backupRestored?: string;
    backupError?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { google_calendar, imported, usersCreated, importFailed, importError, backupRestored, backupError } = await searchParams;
  const isAdmin = session.user.role === "ADMIN";
  const [me, connection, users, projects, countryCode, countries, whatsappSettings, botSettings] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { name: true, email: true, username: true, avatarUrl: true, phone: true },
    }),
    prisma.googleCalendarConnection.findUnique({ where: { userId: session.user.id } }),
    isAdmin
      ? prisma.user.findMany({
          orderBy: [{ active: "desc" }, { name: "asc" }],
          select: { id: true, name: true, email: true, username: true, role: true, avatarUrl: true, phone: true, active: true },
        })
      : Promise.resolve(null),
    isAdmin ? prisma.project.findMany({ where: visibleProjectWhere(session.user), orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve(null),
    isAdmin ? getAppCountryCode() : Promise.resolve(null),
    isAdmin ? getAvailableCountries() : Promise.resolve(null),
    isAdmin ? getWhatsAppSettings() : Promise.resolve(null),
    isAdmin ? getBotSettings() : Promise.resolve(null),
  ]);
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Mi cuenta</h2>
        <ProfileForm name={me.name} username={me.username} email={me.email} phone={me.phone} avatarUrl={me.avatarUrl} />
        <hr className="border-slate-100" />
        <ChangePasswordForm />
      </section>

      {users && <UsersAdmin users={users} currentUserId={session.user.id} />}

      {countryCode && countries && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">País (festivos)</h2>
          <p className="text-sm text-slate-500">
            Un único país para toda la app — se usa para calcular festivos y días hábiles en todos
            los proyectos.
          </p>
          <CountrySettingForm countries={countries} currentCountryCode={countryCode} />
        </section>
      )}

      {isAdmin && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">WhatsApp (alertas)</h2>
          <p className="text-sm text-slate-500">
            Vincula el número que va a mandar las alertas de tareas y proyectos al grupo del equipo.
          </p>
          <WhatsAppConnectPanel
            currentGroupJid={whatsappSettings!.groupJid}
            workHoursStart={whatsappSettings!.workHoursStart}
            workHoursEnd={whatsappSettings!.workHoursEnd}
            dailyDigestHour={whatsappSettings!.dailyDigestHour}
            dailyDigestMinute={whatsappSettings!.dailyDigestMinute}
          />
        </section>
      )}

      {isAdmin && botSettings && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">{botSettings.name} (bot asistente)</h2>
          <p className="text-sm text-slate-500">
            Nombre, foto, tono, clave de Anthropic y tope mensual de preguntas — compartido por todo el equipo.
          </p>
          <BotSettingsForm
            name={botSettings.name}
            avatarUrl={botSettings.avatarUrl}
            apiKeyConfigured={botSettings.apiKeyConfigured}
            apiKeyLast4={botSettings.apiKeyLast4}
            monthlyLimit={botSettings.monthlyLimit}
            usedThisPeriod={botSettings.usedThisPeriod}
            personaPrompt={botSettings.personaPrompt}
            personaIsCustom={botSettings.personaIsCustom}
            introMessage={botSettings.introMessage}
            introMessageIsCustom={botSettings.introMessageIsCustom}
          />
        </section>
      )}

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Pruebas</h2>
        <p className="text-sm text-slate-500">
          Plantillas de pruebas y de respuestas para las tareas tipo Prueba.
        </p>
        <Link href="/settings/tests" className="inline-block text-sm font-medium text-slate-900 hover:underline">
          Ir a Pruebas →
        </Link>
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Etiquetas</h2>
        <p className="text-sm text-slate-500">
          Categorías de etiqueta (color + emoji) para seguir un mismo elemento a través de varias tareas.
        </p>
        <Link href="/settings/tags" className="inline-block text-sm font-medium text-slate-900 hover:underline">
          Ir a Etiquetas →
        </Link>
      </section>

      {projects && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Exportar / Importar datos</h2>
          <p className="text-xs text-slate-400">
            Backup técnico (JSON) de proyecto(s): fases, tareas, asignados, checklist y dependencias; los usuarios
            son opcionales (casilla de abajo). No incluye archivos adjuntos, imágenes ni notificaciones. Importar
            siempre CREA proyectos nuevos — nunca sobrescribe uno existente — y, si el archivo trae usuarios, solo
            crea los que todavía no existen.
          </p>

          {imported !== undefined && (
            <p className="text-sm text-emerald-600">
              Se importaron {imported} proyecto(s){usersCreated ? ` y se crearon ${usersCreated} usuario(s) nuevo(s)` : ""}.
              {importFailed && <span className="mt-1 block text-red-600">Fallaron: {importFailed}</span>}
            </p>
          )}
          {importError && <p className="text-sm text-red-600">{importError}</p>}

          <form action="/api/export" method="get" className="space-y-2">
            <p className="text-sm text-slate-600">Exportar</p>
            <label className="flex items-start gap-1.5 text-sm text-slate-600">
              <input type="checkbox" name="includeUsers" value="1" className="mt-0.5 rounded border-slate-300" />
              <span>Incluir usuarios (con su contraseña cifrada — guardá el archivo en un lugar seguro)</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {/* scope=all: exporta todos los proyectos aunque haya alguno tildado abajo. */}
              <button
                type="submit"
                name="scope"
                value="all"
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Todos los proyectos
              </button>
            </div>
            {projects.length > 0 && (
              <>
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
              </>
            )}
          </form>

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

      {isAdmin && (
        <>
          {backupRestored && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Respaldo total restaurado correctamente.</p>}
          {backupError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{backupError}</p>}
          <FullBackupPanel />
        </>
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
      </section>
    </div>
  );
}
