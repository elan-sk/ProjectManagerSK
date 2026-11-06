import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { visibleProjectWhere } from "@/lib/permissions";
import { FullBackupPanel } from "../FullBackupPanel";
import { AdminOnly, SettingsCard } from "../SettingsCard";

export default async function BackupsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string; usersCreated?: string; importFailed?: string; importError?: string; backupRestored?: string; backupError?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") return <AdminOnly />;
  const { imported, usersCreated, importFailed, importError, backupRestored, backupError } = await searchParams;
  const projects = await prisma.project.findMany({ where: visibleProjectWhere(session.user, { includeArchived: true }), orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      {backupRestored && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Respaldo total restaurado correctamente.</p>}
      {backupError && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{backupError}</p>}
      <FullBackupPanel />
      <SettingsCard title="Exportar / Importar datos">
          <p className="text-xs text-slate-400">
            Backup técnico (JSON) de proyecto(s): fases, tareas, responsables, checklist y dependencias; los usuarios
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
      </SettingsCard>
    </>
  );
}
