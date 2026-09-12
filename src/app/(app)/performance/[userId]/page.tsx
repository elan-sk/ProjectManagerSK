import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPerformance, getUserPerformanceByProject, getRecentOnTimeTrend } from "@/lib/delays";
import {
  getReviewPerformance,
  getReviewPerformanceByProject,
  getFailureAnalysisByUser,
  getFailureInsight,
  getRecentFirstPassTrend,
} from "@/lib/reviewPerformance";
import { PERFORMANCE_GOALS } from "@/lib/performanceGoals";
import { Avatar } from "@/components/Avatar";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { toDonutData } from "@/lib/chartPalette";

function GoalTile({
  label,
  value,
  goalLabel,
  meetsGoal,
  captionPrefix = "Meta",
}: {
  label: string;
  value: string;
  goalLabel: string;
  meetsGoal: boolean | null;
  captionPrefix?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          meetsGoal === null ? "text-slate-900" : meetsGoal ? "text-emerald-600" : "text-red-600"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {captionPrefix}: {goalLabel}
      </p>
    </div>
  );
}

export default async function IndividualPerformancePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { userId } = await params;
  const isOwnPage = userId === session.user.id;

  const isAdmin = session.user.role === "ADMIN";
  const myPmProjectIds = isAdmin
    ? null
    : (await prisma.project.findMany({ where: { pmId: session.user.id }, select: { id: true } })).map((p) => p.id);
  const isPM = Boolean(myPmProjectIds && myPmProjectIds.length > 0);
  // Cualquiera ve su propio rendimiento completo. Ver el de otra persona es
  // privilegio de admin (todos) o PM (solo miembros de sus propios
  // proyectos, acotado a esos proyectos) — un miembro normal no ve datos ajenos.
  if (!isOwnPage && !isAdmin && !isPM) redirect(`/performance/${session.user.id}`);

  const scopeProjectIds = isOwnPage || isAdmin ? undefined : myPmProjectIds!;

  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, avatarUrl: true } });
  if (!targetUser) redirect("/performance");

  const [overall, byProject, reviewOverall, reviewByProject, failureAnalysis, recentOnTime, recentFirstPass] = await Promise.all([
    getUserPerformance(userId, scopeProjectIds),
    getUserPerformanceByProject(userId, scopeProjectIds),
    getReviewPerformance(scopeProjectIds),
    getReviewPerformanceByProject(userId, scopeProjectIds),
    getFailureAnalysisByUser(userId, scopeProjectIds),
    getRecentOnTimeTrend(userId, scopeProjectIds),
    getRecentFirstPassTrend(userId, scopeProjectIds),
  ]);

  // Un PM sin ningún proyecto en común con esta persona no tiene nada que ver acá.
  if (!isOwnPage && !isAdmin && byProject.length === 0 && reviewByProject.length === 0) redirect("/performance");

  const summary = overall[0];
  const review = reviewOverall.find((r) => r.userId === userId);

  const onTimePct = summary?.onTimeRate == null ? null : Math.round(summary.onTimeRate * 100);
  // First Pass Yield (Six Sigma): tareas distintas aprobadas sin devolución /
  // tareas distintas revisadas — a diferencia de roundsSubmitted (que cuenta
  // cada reenvío), tasksReviewed cuenta cada tarea una sola vez.
  const firstTryRate = review && review.tasksReviewed > 0 ? review.roundsApprovedFirstTry / review.tasksReviewed : null;
  const reworkRate = review && review.tasksReviewed > 0 ? review.roundsSubmitted / review.tasksReviewed : null;
  const failureInsight = getFailureInsight(failureAnalysis.byCategory);

  return (
    <div className="space-y-8">
      <div>
        {(isAdmin || isPM) && (
          <Link href="/performance" className="text-sm text-slate-500 hover:underline">
            ← Rendimiento
          </Link>
        )}
        <div className="mt-1 flex items-center gap-2">
          <Avatar name={targetUser.name} avatarUrl={targetUser.avatarUrl} size="h-8 w-8 text-sm" />
          <h1 className="text-2xl font-semibold text-slate-900">{targetUser.name}</h1>
        </div>
        {!isOwnPage && !isAdmin && <p className="text-sm text-slate-500">Solo datos de los proyectos que administrás.</p>}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Acumulado total</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <GoalTile
            label="% cumplimiento a tiempo"
            value={onTimePct === null ? "—" : `${summary!.tasksOnTime}/${summary!.tasksCompleted} (${onTimePct}%)`}
            goalLabel={`${Math.round(PERFORMANCE_GOALS.onTimeRate * 100)}%`}
            meetsGoal={onTimePct === null ? null : onTimePct / 100 >= PERFORMANCE_GOALS.onTimeRate}
          />
          <GoalTile
            label="Tareas completadas"
            value={String(summary?.tasksCompleted ?? 0)}
            goalLabel={String(PERFORMANCE_GOALS.tasksCompleted)}
            meetsGoal={(summary?.tasksCompleted ?? 0) >= PERFORMANCE_GOALS.tasksCompleted}
          />
          <GoalTile
            label="Aprobado al 1er intento (revisión)"
            value={
              firstTryRate === null
                ? "—"
                : `${review!.roundsApprovedFirstTry}/${review!.tasksReviewed} (${Math.round(firstTryRate * 100)}%)`
            }
            goalLabel={`${Math.round(PERFORMANCE_GOALS.firstTryApprovalRate * 100)}%`}
            meetsGoal={firstTryRate === null ? null : firstTryRate >= PERFORMANCE_GOALS.firstTryApprovalRate}
          />
          <GoalTile
            label="Rondas promedio por tarea"
            value={reworkRate === null ? "—" : reworkRate.toFixed(1)}
            goalLabel="1.0 (sin reproceso)"
            meetsGoal={null}
          />
        </div>
      </section>

      {(recentOnTime || recentFirstPass) && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Tendencia reciente</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {recentOnTime && (
              <GoalTile
                label={`% a tiempo (últimas ${recentOnTime.count})`}
                value={`${Math.round(recentOnTime.rate * 100)}%`}
                goalLabel={onTimePct === null ? "—" : `${onTimePct}%`}
                meetsGoal={onTimePct === null ? null : Math.round(recentOnTime.rate * 100) >= onTimePct}
                captionPrefix="Histórico"
              />
            )}
            {recentFirstPass && (
              <GoalTile
                label={`% aprobado 1er intento (últimas ${recentFirstPass.count})`}
                value={`${Math.round(recentFirstPass.rate * 100)}%`}
                goalLabel={firstTryRate === null ? "—" : `${Math.round(firstTryRate * 100)}%`}
                meetsGoal={firstTryRate === null ? null : recentFirstPass.rate >= firstTryRate}
                captionPrefix="Histórico"
              />
            )}
          </div>
        </section>
      )}

      {review && review.roundsApprovedFirstTry + review.roundsReturned > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Rondas: aprobadas a la 1ra vs. devueltas</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <BarChart
              data={[
                { label: "Aprobadas", value: review.roundsApprovedFirstTry, colorClass: "bg-emerald-500" },
                { label: "Devueltas", value: review.roundsReturned, colorClass: "bg-red-500" },
              ]}
            />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Por proyecto</h2>
        {byProject.length === 0 ? (
          <p className="text-sm text-slate-500">Sin tareas asignadas en el alcance visible.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Proyecto</th>
                  <th className="px-4 py-2 font-medium">Completadas</th>
                  <th className="px-4 py-2 font-medium">A tiempo</th>
                  <th className="px-4 py-2 font-medium">Días de atraso</th>
                  <th className="px-4 py-2 font-medium">Rondas enviadas</th>
                  <th className="px-4 py-2 font-medium">Aprobado 1er intento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byProject.map((p) => {
                  const rev = reviewByProject.find((r) => r.projectId === p.projectId);
                  const pct = p.onTimeRate == null ? null : Math.round(p.onTimeRate * 100);
                  const revPct =
                    rev && rev.tasksReviewed > 0 ? Math.round((rev.roundsApprovedFirstTry / rev.tasksReviewed) * 100) : null;
                  const pctMeetsGoal = pct === null ? null : pct / 100 >= PERFORMANCE_GOALS.onTimeRate;
                  const revPctMeetsGoal = revPct === null ? null : revPct / 100 >= PERFORMANCE_GOALS.firstTryApprovalRate;
                  return (
                    <tr key={p.projectId}>
                      <td className="px-4 py-2 font-medium text-slate-900">{p.projectName}</td>
                      <td className="px-4 py-2 text-slate-600">{p.tasksCompleted}</td>
                      <td
                        className={`px-4 py-2 font-medium ${
                          pctMeetsGoal === null ? "text-slate-600" : pctMeetsGoal ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {pct === null ? "—" : `${p.tasksOnTime}/${p.tasksCompleted} (${pct}%)`}
                      </td>
                      <td className={`px-4 py-2 font-medium ${p.totalDelayDays > 0 ? "text-red-600" : "text-slate-600"}`}>
                        {p.totalDelayDays}
                      </td>
                      <td className="px-4 py-2 text-slate-600">{rev?.roundsSubmitted ?? 0}</td>
                      <td
                        className={`px-4 py-2 font-medium ${
                          revPctMeetsGoal === null ? "text-slate-600" : revPctMeetsGoal ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {revPct === null ? "—" : `${rev!.roundsApprovedFirstTry}/${rev!.tasksReviewed} (${revPct}%)`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(failureAnalysis.byCategory.length > 0 || failureAnalysis.byResponseCategory.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Patrones de error en sus entregas</h2>
          <p className="text-sm text-slate-500">
            Categorías de error y tipo de corrección más frecuentes en las devoluciones de las rondas que entregó —
            para identificar en qué trabajar (enfoque PSP: los propios patrones, no los ajenos).
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {failureAnalysis.byCategory.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-medium text-slate-700">Categorías de error más comunes</h3>
                <DonutChart data={toDonutData(failureAnalysis.byCategory)} />
              </div>
            )}
            {failureAnalysis.byResponseCategory.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-medium text-slate-700">Tipo de corrección más frecuente</h3>
                <DonutChart data={toDonutData(failureAnalysis.byResponseCategory)} />
              </div>
            )}
          </div>

          {failureInsight && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              💡 {failureInsight}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
