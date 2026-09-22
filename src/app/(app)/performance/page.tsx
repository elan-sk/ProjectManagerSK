import Link from "next/link";
import { visibleProjectWhere } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPerformance, getTeamContribution, getProjectReport, getCompletionTrend, getRecentOnTimeTrend } from "@/lib/delays";
import {
  getReviewPerformance,
  getCommonFailureCategories,
  getCommonResponseCategories,
  getRecentFirstPassTrend,
} from "@/lib/reviewPerformance";
import { TASK_STATUS_LABEL } from "@/lib/statusColors";
import { BarChart, TrendBars } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { toDonutData } from "@/lib/chartPalette";
import { ComboFilter } from "@/components/ComboFilter";
import { ResetFiltersButton } from "@/components/ResetFiltersButton";
import { ProjectIcon } from "@/components/ProjectIcon";

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

/** Compara el % reciente (últimas N) contra el histórico acumulado — ↑/↓ verde/rojo, para ver si mejora o empeora. */
function TrendCell({ recent, historicalRate }: { recent: { rate: number; count: number } | null; historicalRate: number | null }) {
  if (!recent) return <span className="text-slate-400">—</span>;
  const recentPct = Math.round(recent.rate * 100);
  if (historicalRate === null) return <span className="text-slate-600">{recentPct}%</span>;
  const improving = recentPct >= Math.round(historicalRate * 100);
  return (
    <span className={improving ? "text-emerald-600" : "text-red-600"}>
      {improving ? "↑" : "↓"} {recentPct}%
    </span>
  );
}

type ReviewPerf = Awaited<ReturnType<typeof getReviewPerformance>>[number];
type RecentTrendType = Awaited<ReturnType<typeof getRecentFirstPassTrend>>;

/** Punto confirmado con el usuario: Pruebas y Aceptaciones se muestran separadas (revisor interno vs. cliente externo), nunca mezcladas en el mismo total. */
function ReviewPerformanceSection({
  title,
  description,
  reviewPerformance,
  failureCategories,
  responseCategories,
  trendByUser,
}: {
  title: string;
  description: string;
  reviewPerformance: ReviewPerf[];
  failureCategories: { category: string; count: number }[];
  responseCategories: { category: string; count: number }[];
  trendByUser: Map<string, RecentTrendType>;
}) {
  if (reviewPerformance.length === 0 && failureCategories.length === 0 && responseCategories.length === 0) return null;

  const roundsApprovedFirstTryTotal = reviewPerformance.reduce((sum, p) => sum + p.roundsApprovedFirstTry, 0);
  const roundsReturnedTotal = reviewPerformance.reduce((sum, p) => sum + p.roundsReturned, 0);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500">{description}</p>

      {roundsApprovedFirstTryTotal + roundsReturnedTotal > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-700">Rondas: aprobadas a la 1ra vs. devueltas</h3>
          <BarChart
            data={[
              { label: "Aprobadas", value: roundsApprovedFirstTryTotal, colorClass: "progress-fill-emerald" },
              { label: "Devueltas", value: roundsReturnedTotal, colorClass: "progress-fill-red" },
            ]}
          />
        </div>
      )}

      {(failureCategories.length > 0 || responseCategories.length > 0) && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {failureCategories.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-medium text-slate-700">Categorías de error más comunes</h3>
              <DonutChart data={toDonutData(failureCategories)} />
            </div>
          )}
          {responseCategories.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-medium text-slate-700">Tipo de corrección más frecuente</h3>
              <DonutChart data={toDonutData(responseCategories)} />
            </div>
          )}
        </div>
      )}

      {reviewPerformance.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Persona</th>
                <th className="px-4 py-2 font-medium">Rondas enviadas</th>
                <th className="px-4 py-2 font-medium">Tareas revisadas</th>
                <th className="px-4 py-2 font-medium">Aprobadas al 1er intento</th>
                <th className="px-4 py-2 font-medium">Rondas/tarea</th>
                <th className="px-4 py-2 font-medium">Devueltas</th>
                <th className="px-4 py-2 font-medium">Tendencia (últimas 5)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reviewPerformance.map((p) => {
                const fpy = p.tasksReviewed > 0 ? p.roundsApprovedFirstTry / p.tasksReviewed : null;
                const reworkRate = p.tasksReviewed > 0 ? p.roundsSubmitted / p.tasksReviewed : null;
                return (
                  <tr key={p.userId}>
                    <td className="px-4 py-2 font-medium text-slate-900">{p.userName}</td>
                    <td className="px-4 py-2 text-slate-600">{p.roundsSubmitted}</td>
                    <td className="px-4 py-2 text-slate-600">{p.tasksReviewed}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {p.tasksReviewed === 0
                        ? "—"
                        : `${p.roundsApprovedFirstTry}/${p.tasksReviewed} (${Math.round((fpy ?? 0) * 100)}%)`}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{reworkRate === null ? "—" : reworkRate.toFixed(1)}</td>
                    <td className={`px-4 py-2 font-medium ${p.roundsReturned > 0 ? "text-orange-600" : "text-slate-600"}`}>
                      {p.roundsReturned}
                    </td>
                    <td className="px-4 py-2 font-medium">
                      <TrendCell recent={trendByUser.get(p.userId) ?? null} historicalRate={fpy} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
  // Administrador: todos los proyectos salvo los ocultos de los que no es responsable (PM).
  const adminVisibleIds = isAdmin ? (await prisma.project.findMany({ where: visibleProjectWhere(session.user), select: { id: true } })).map((p) => p.id) : null;
  const isPM = Boolean(myPmProjectIds && myPmProjectIds.length > 0);
  // Un miembro normal no tiene informe grupal — lo mandamos directo al suyo.
  if (!isAdmin && !isPM) redirect(`/performance/${session.user.id}`);

  const { projectId } = await searchParams;
  // Si es PM, queda acotado a sus proyectos aunque el projectId de la URL
  // sea de uno ajeno (o no exista) — nunca ve datos de un proyecto que no administra.
  const selectedProjectIds = isAdmin
    ? projectId && adminVisibleIds!.includes(projectId)
      ? [projectId]
      : adminVisibleIds!
    : projectId && myPmProjectIds!.includes(projectId)
    ? [projectId]
    : myPmProjectIds!;

  const [
    projects,
    performance,
    workload,
    report,
    trend,
    qaPerformance,
    qaFailureCategories,
    qaResponseCategories,
    acceptancePerformance,
    acceptanceFailureCategories,
    acceptanceResponseCategories,
  ] = await Promise.all([
    prisma.project.findMany({
      where: isAdmin ? visibleProjectWhere(session.user) : { id: { in: myPmProjectIds! } },
      orderBy: { name: "asc" },
    }),
    getUserPerformance(undefined, selectedProjectIds),
    getTeamContribution(selectedProjectIds),
    getProjectReport(selectedProjectIds),
    getCompletionTrend(selectedProjectIds, 8),
    getReviewPerformance("QA", selectedProjectIds),
    getCommonFailureCategories("QA", selectedProjectIds),
    getCommonResponseCategories("QA", selectedProjectIds),
    getReviewPerformance("ACCEPTANCE", selectedProjectIds),
    getCommonFailureCategories("ACCEPTANCE", selectedProjectIds),
    getCommonResponseCategories("ACCEPTANCE", selectedProjectIds),
  ]);

  const onTimeRanked = performance
    .filter((p) => p.tasksCompleted > 0)
    .map((p) => ({ label: p.userName, value: Math.round((p.onTimeRate ?? 0) * 100) }))
    .sort((a, b) => b.value - a.value);

  const delayRanked = performance
    .filter((p) => p.totalDelayDays > 0)
    .map((p) => ({ label: p.userName, value: p.totalDelayDays, colorClass: "progress-fill-red" }))
    .sort((a, b) => b.value - a.value);

  const [onTimeTrends, qaTrends, acceptanceTrends] = await Promise.all([
    Promise.all(performance.map((p) => getRecentOnTimeTrend(p.userId, selectedProjectIds))),
    Promise.all(qaPerformance.map((p) => getRecentFirstPassTrend(p.userId, "QA", selectedProjectIds))),
    Promise.all(acceptancePerformance.map((p) => getRecentFirstPassTrend(p.userId, "ACCEPTANCE", selectedProjectIds))),
  ]);
  const onTimeTrendByUser = new Map(performance.map((p, i) => [p.userId, onTimeTrends[i]]));
  const qaTrendByUser = new Map(qaPerformance.map((p, i) => [p.userId, qaTrends[i]]));
  const acceptanceTrendByUser = new Map(acceptancePerformance.map((p, i) => [p.userId, acceptanceTrends[i]]));

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) ?? null : null;

  const contributionBars = workload
    .filter((w) => w.percent > 0 || w.openTotal > 0)
    .map((w) => ({
      label: w.userName,
      value: w.percent,
      colorClass: w.percent === 0 ? "bg-slate-300" : "progress-fill-teal",
      note: w.openTotal > 0 ? `${w.openTotal} abierta${w.openTotal !== 1 ? "s" : ""}` : undefined,
    }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectedProject && (
            <ProjectIcon name={selectedProject.name} iconUrl={selectedProject.iconUrl} size="h-8 w-8 text-sm" projectId={selectedProject.id} />
          )}
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Rendimiento</h1>
            {!isAdmin && <p className="text-sm text-slate-500">Los proyectos que administrás.</p>}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <ResetFiltersButton count={projectId ? 1 : 0} href="/performance" aligned={false} />
          <ComboFilter
            allLabel={isAdmin ? "Todos los proyectos" : "Todos los míos"}
            value={projectId}
            options={projects.map((p) => ({ id: p.id, label: p.name }))}
            paramKey="projectId"
            basePath="/performance"
            currentParams={{}}
            align="right"
          />
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
        <h2 className="text-lg font-semibold text-slate-900">Carga de equipo</h2>
        <p className="text-sm text-slate-500">
          Aporte relativo de cada integrante: qué parte del trabajo entregado hizo (una tarea compartida se reparte entre sus asignados). A la derecha, sus tareas abiertas.
        </p>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <BarChart data={contributionBars} valueSuffix="%" emptyLabel="Todavía no hay tareas completadas ni abiertas con este filtro." />
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
            <BarChart data={onTimeRanked.map((r) => ({ ...r, colorClass: "progress-fill-emerald" }))} valueSuffix="%" />
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
                <th className="px-4 py-2 font-medium">Tendencia (últimas 5)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {performance.map((p) => (
                <tr key={p.userId}>
                  <td className="px-4 py-2 font-medium text-slate-900">
                    <Link href={`/performance/${p.userId}`} className="hover:underline">
                      {p.userName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{p.tasksAssigned}</td>
                  <td className="px-4 py-2 text-slate-600">{p.tasksCompleted}</td>
                  <td className="px-4 py-2 text-slate-600">{p.tasksOnTime}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {p.onTimeRate === null ? "—" : `${Math.round(p.onTimeRate * 100)}%`}
                  </td>
                  <td className={`px-4 py-2 font-medium ${p.totalDelayDays > 0 ? "text-red-600" : "text-slate-600"}`}>
                    {p.totalDelayDays}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    <TrendCell recent={onTimeTrendByUser.get(p.userId) ?? null} historicalRate={p.onTimeRate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Punto 2.6.2/2.6.3: Revisión — enfoque PSP ligero (detección de
          errores, calidad, patrones), sin métricas de código. Pruebas y
          Aceptaciones separadas (confirmado con el usuario): miden roles
          distintos, revisor interno vs. cliente externo. */}
      <ReviewPerformanceSection
        title="Pruebas"
        description="Rondas enviadas y aprobadas como responsable en tareas tipo Prueba (QA), y qué categorías de error se repiten más — para detectar patrones, no para señalar personas."
        reviewPerformance={qaPerformance}
        failureCategories={qaFailureCategories}
        responseCategories={qaResponseCategories}
        trendByUser={qaTrendByUser}
      />

      <ReviewPerformanceSection
        title="Aceptaciones"
        description="Rondas enviadas y aceptadas como responsable en tareas tipo Aceptación — acá quien califica es el cliente, no un revisor interno."
        reviewPerformance={acceptancePerformance}
        failureCategories={acceptanceFailureCategories}
        responseCategories={acceptanceResponseCategories}
        trendByUser={acceptanceTrendByUser}
      />
    </div>
  );
}
