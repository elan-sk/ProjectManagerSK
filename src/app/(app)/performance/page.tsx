import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUserPerformance } from "@/lib/delays";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId } = await searchParams;

  const [projects, performance] = await Promise.all([
    prisma.project.findMany({ orderBy: { name: "asc" } }),
    getUserPerformance(undefined, projectId),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Rendimiento</h1>
        <div className="flex gap-2 text-sm">
          <Link
            href="/performance"
            className={`rounded-lg px-3 py-1.5 ${!projectId ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Todos los proyectos
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

      <p className="text-sm text-slate-500">
        El atraso de cada persona cuenta solo lo que su propia tarea demoró de más sobre
        lo planeado — no arrastra los atrasos ajenos de los que haya dependido.
      </p>

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
                <td
                  className={`px-4 py-2 font-medium ${p.totalDelayDays > 0 ? "text-red-600" : "text-slate-600"}`}
                >
                  {p.totalDelayDays}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
