import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPerformance, getTeamWorkload, getProjectReport, getCompletionTrend } from "@/lib/delays";
import { TASK_STATUS_LABEL } from "@/lib/statusColors";
import { BarChart, TrendBars } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";

const STATUS_HEX: Record<string, string> = {
  NOT_STARTED: "#94a3b8",
  IN_PROGRESS: "#3b82f6",
  BLOCKED: "#ef4444",
  COMPLETED: "#10b981",
};
const STATUS_DOT: Record<string, string> = {
  NOT_STARTED: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  BLOCKED: "bg-red-500",
  COMPLETED: "bg-emerald-500",
};
const RISK_LABEL: Record<string, string> = { LOW: "Bajo", MEDIUM: "Medio", HIGH: "Alto" };
const RISK_HEX: Record<string, string> = { LOW: "#10b981", MEDIUM: "#f59e0b", HIGH: "#ef4444" };
const RISK_DOT: Record<string, string> = { LOW: "bg-emerald-500", MEDIUM: "bg-amber-500", HIGH: "bg-red-500" };

function StatTile({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Rendimiento individual es privilegio de admin (todos los proyectos) o
  // PM (solo los que administra) — un miembro normal no ve datos de otros.
  const isAdmin = session.user.role === "ADMIN";
  const myPmProjectIds = isAdmin
    ? null
    : (await prisma.project.findMany({ where: { pmId: session.user.id }, select: { id: true } })).map((p) => p.id);
  const isPM = Boolean(myPmProjectIds && myPmProjectIds.length > 0);
  if (!isAdmin && !isPM) redirect("/agenda");

  const { projectId } = await searchParams;
  // Si es PM, queda acotado a sus proyectos aunque el projectId de la URL
  // sea de uno ajeno (o no exista) — nunca ve datos de un proyecto que no administra.
  const selectedProjectIds = isAdmin
    ? projectId
      ? [projectId]
      : undefined
    : projectId && myPmProjectIds!.includes(projectId)
    ? [projectId]
    : myPmProjectIds!;

  const [projects, performance, workload, report, trend] = await Promise.all([
    prisma.project.findMany({
      where: isAdmin ? undefined : { id: { in: myPmProjectIds! } },
      orderBy: { name: "asc" },
    }),
    getUserPerformance(undefined, selectedProjectIds),
    getTeamWorkload(selectedProjectIds),
    getProjectReport(selectedProjectIds),
    getCompletionTrend(selectedProjectIds, 8),
  ]);

  const onTimeRanked = performance
    .filter((p) => p.tasksCompleted > 0)
    .map((p) => ({ label: p.userName, value: Math.round((p.onTimeRate ?? 0) * 100) }))
    .sort((a, b) => b.value - a.value);

  const delayRanked = performance
    .filter((p) => p.totalDelayDays > 0)
    .map((p) => ({ label: p.userName, value: p.totalDelayDays, colorClass: "bg-red-500" }))
    .sort((a, b) => b.value - a.value);

  const workloadBars = workload
    .filter((w) => w.openTotal > 0)
    .map((w) => ({
      label: w.userName,
      value: w.openTotal,
      colorClass: w.overdueCount > 0 ? "bg-red-500" : "bg-slate-900",
      note: w.overdueCount > 0 ? `(${w.overdueCount} atr.)` : undefined,
    }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Rendimiento</h1>
          {!isAdmin && <p className="text-sm text-slate-500">Los proyectos que administrás.</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/performance"
            className={`rounded-lg px-3 py-1.5 ${!projectId ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {isAdmin ? "Todos los proyectos" : "Todos los míos"}
          </Link>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/performance?projectId=${p.id}`}
              className={`rounded-lg px-3 py-1.5 ${projectId === p.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Informe general — pulso del proyecto (o de todos), no solo por persona. */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Informe general</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Tareas totales" value={String(report.totalTasks)} />
          <StatTile
            label="% cumplimiento a tiempo"
            value={report.onTimeRate === null ? "—" : `${Math.round(report.onTimeRate * 100)}%`}
          />
          <StatTile
            label="Atraso promedio"
            value={`${report.avgDelayDays} d`}
            tone={report.avgDelayDays > 0 ? "text-red-600" : "text-slate-900"}
          />
          <StatTile
            label="Cuellos de botella activos"
            value={String(report.bottlenecks.length)}
            tone={report.bottlenecks.length > 0 ? "text-amber-600" : "text-slate-900"}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-700">Por estado</h3>
            <DonutChart
              data={Object.entries(report.statusBreakdown).map(([status, value]) => ({
                label: TASK_STATUS_LABEL[status as keyof typeof TASK_STATUS_LABEL] ?? status,
                value,
                colorClass: STATUS_DOT[status],
                colorHex: STATUS_HEX[status],
              }))}
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-700">Por riesgo</h3>
            <DonutChart
              data={Object.entries(report.riskBreakdown).map(([risk, value]) => ({
                label: RISK_LABEL[risk] ?? risk,
                value,
                colorClass: RISK_DOT[risk],
                colorHex: RISK_HEX[risk],
              }))}
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-700">Tareas cerradas por semana</h3>
            <TrendBars data={trend.map((t) => ({ label: t.weekLabel, value: t.completed }))} />
          </div>
        </div>

        {report.bottlenecks.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-medium text-slate-700">Cuellos de botella activos</h3>
            <ul className="space-y-1.5 text-sm">
              {report.bottlenecks.map((b) => (
                <li key={b.id} className="flex items-baseline gap-2">
                  <Link href={`/projects/${b.projectId}/tasks/${b.id}`} className="font-medium text-slate-900 hover:underline">
                    {b.title}
                  </Link>
                  <span className="text-xs text-amber-600">{b.bottleneckReason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Carga del equipo — quién está sobrecargado / quién tiene margen ahora mismo. */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Carga del equipo</h2>
        <p className="text-sm text-slate-500">Tareas abiertas (no completadas) asignadas a cada persona en este momento.</p>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <BarChart data={workloadBars} emptyLabel="Nadie tiene tareas abiertas con este filtro." />
        </div>
      </section>

      {/* Rendimiento individual — tabla + rankings visuales. */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Rendimiento individual</h2>
        <p className="text-sm text-slate-500">
          El atraso de cada persona cuenta solo lo que su propia tarea demoró de más sobre lo planeado — no arrastra
          los atrasos ajenos de los que haya dependido.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-700">% cumplimiento a tiempo</h3>
            <BarChart data={onTimeRanked.map((r) => ({ ...r, colorClass: "bg-emerald-500" }))} valueSuffix="%" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-700">Días de atraso acumulados</h3>
            <BarChart data={delayRanked} valueSuffix="d" emptyLabel="Nadie tiene atrasos acumulados." />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Persona</th>
                <th className="px-4 py-2 font-medium">Asignadas</th>
                <th className="px-4 py-2 font-medium">Completadas</th>
                <th className="px-4 py-2 font-medium">A tiempo</th>
                <th className="px-4 py-2 font-medium">% cumplimiento</th>
                <th className="px-4 py-2 font-medium">Días de atraso acumulados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {performance.map((p) => (
                <tr key={p.userId}>
                  <td className="px-4 py-2 font-medium text-slate-900">{p.userName}</td>
                  <td className="px-4 py-2 text-slate-600">{p.tasksAssigned}</td>
                  <td className="px-4 py-2 text-slate-600">{p.tasksCompleted}</td>
                  <td className="px-4 py-2 text-slate-600">{p.tasksOnTime}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {p.onTimeRate === null ? "—" : `${Math.round(p.onTimeRate * 100)}%`}
                  </td>
                  <td className={`px-4 py-2 font-medium ${p.totalDelayDays > 0 ? "text-red-600" : "text-slate-600"}`}>
                    {p.totalDelayDays}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
