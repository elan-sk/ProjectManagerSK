import Link from "next/link";
import { BalancedColumns } from "@/components/BalancedColumns";
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
    isAdmin ? prisma.project.findMany({ where: visibleProjectWhere(session.user, { includeArchived: true }), orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve(null),
    isAdmin ? getAppCountryCode() : Promise.resolve(null),
    isAdmin ? getAvailableCountries() : Promise.resolve(null),
    isAdmin ? getWhatsAppSettings() : Promise.resolve(null),
    isAdmin ? getBotSettings() : Promise.resolve(null),
  ]);
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>

      {/* Todo el ancho: tantas columnas como entren (~26rem cada una), todas a ras abajo
          (BalancedColumns estira la última tarjeta de cada columna). */}
      <BalancedColumns minColumnWidth={416}>

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
        <section id="whatsapp" className="scroll-mt-20 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
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

      </BalancedColumns>

      <section className="grid gap-8 rounded-xl border border-slate-200 bg-white p-6 lg:grid-cols-[1fr_minmax(16rem,22rem)]">
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- ícono estático de la app (el mismo de la instalación) */}
            <img src="/icons/icon-192.png" alt="" className="h-12 w-12 rounded-xl" />
            <p className="font-display font-black text-xl tracking-[-0.02em] text-slate-900">
              ProjectManager<span className="text-[color:var(--sand-warm)]">SK</span>
            </p>
          </div>
          <div className="space-y-1 mb-8">
            <h3 className="text-center font-bold text-slate-900 mb-4">¿Qué es?</h3>
            <p className="mx-auto text-center text-balance text-sm text-slate-600">
              Una aplicación para llevar cada proyecto de principio a fin: qué se quiere lograr, qué hay que hacer, quién lo hace y
              para cuándo. Avisa a tiempo cuando algo se atrasa y deja al cliente participar desde un link, sin crear una cuenta.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-center font-bold text-slate-900 mb-4">¿Qué se puede hacer?</h3>
            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
              {APP_FEATURES.map((f) => (
                <li key={f.title} className="text-center text-sm sm:text-left">
                  <p className="font-medium text-slate-800">
                    <span aria-hidden className="mr-1.5">{f.icon}</span>
                    {f.title}
                  </p>
                  <p className="text-balance text-slate-500">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col justify-center space-y-3 text-center lg:border-l lg:border-slate-100 lg:pl-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático de marca, no aplica optimización de next/image */}
          <img src="/brand/logo-elan-sk-soft.svg" alt="Elan SK Soft" className="mx-auto h-24" />
          <h2 className="font-black text-xl text-slate-900">ProjectManagerSK</h2>
          <p className="text-sm text-slate-600">
            Es un producto de <b>Elan-SK Soft</b>, elaborado por <b>ELAN-SK</b>, para organizar proyectos, tareas y tiempos del equipo en un solo lugar.
          </p>
          <p className="text-sm text-slate-600">
            Contacto:{" "}
            <a href="mailto:elan-sk@hotmail.com" className="text-slate-900 underline hover:text-slate-700">
              elan-sk@hotmail.com
            </a>
          </p>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Elaborado por ELAN-SK <br/> Todos los derechos reservados.</p>
        </div>
      </section>
    </div>
  );
} 

// Resumen de lo que ofrece la app, para la tarjeta «Sobre ProjectManagerSK».
const APP_FEATURES = [
  { icon: "🎯", title: "Definir el proyecto", text: "Objetivos, requerimientos y fases, con el avance de cada uno calculado a partir de sus tareas." },
  { icon: "🗂️", title: "Planear y seguir tareas", text: "Tablero, Gantt con dependencias y calendario; tareas con checklist, insumos y evidencias." },
  { icon: "✅", title: "Revisar la calidad", text: "Pruebas con plantillas y rondas de revisión, Ajustes y Aceptaciones que califica el cliente." },
  { icon: "🔗", title: "Trabajar con el cliente", text: "Links compartidos para ver el avance, comentar, responder preguntas y subir insumos." },
  { icon: "⏳", title: "Anticipar atrasos", text: "Alertas por tarea y el estado del proyecto: retraso u holgura frente a la fecha de cierre." },
  { icon: "📊", title: "Medir el rendimiento", text: "Cumplimiento a tiempo, carga del equipo, calidad de las revisiones y uso de la app." },
  { icon: "💬", title: "Avisos por WhatsApp", text: "Asignaciones, vencimientos, resumen diario y alertas al grupo de cada proyecto." },
  { icon: "🤖", title: "Asistente con IA", text: "Responde sobre proyectos y tiempos, y hace cambios con confirmación; también se conecta con Claude." },
  { icon: "📁", title: "Archivos en orden", text: "Galería por proyecto, sin archivos repetidos y con el detalle de dónde se usa cada uno." },
  { icon: "🔐", title: "Contraseñas seguras", text: "Accesos guardados cifrados, visibles solo para quien corresponda, con botón de copiar e historial de quién los vio." },
];
