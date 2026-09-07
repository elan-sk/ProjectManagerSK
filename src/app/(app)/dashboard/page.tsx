import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getBottlenecks, getProjectDelaySummary } from "@/lib/delays";
import { WarningIcon } from "@/components/icons";

export default async function DashboardPage() {
  const projects = await prisma.project.findMany({
    include: { tasks: true },
    orderBy: { createdAt: "desc" },
  });

  const summaries = await Promise.all(
    projects.map(async (p) => {
      const total = p.tasks.length;
      const completed = p.tasks.filter((t) => t.status === "COMPLETED").length;
      const bottlenecks = await getBottlenecks(p.id);
      const delays = await getProjectDelaySummary(p.id);
      return { project: p, total, completed, bottlenecks, delays };
    })
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Panorama</h1>
        <p className="mt-1 text-slate-500">Resumen de todos tus proyectos.</p>
      </div>

      {summaries.length === 0 && (
        <p className="text-sm text-slate-500">
          Todavía no tenés proyectos.{" "}
          <Link href="/projects" className="underline">
            Crear el primero
          </Link>
          .
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {summaries.map(({ project, total, completed, bottlenecks, delays }) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-slate-900">{project.name}</h2>
              <span className="text-xs text-slate-500">
                {completed}/{total} tareas
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-emerald-500"
                style={{ width: total > 0 ? `${Math.round((completed / total) * 100)}%` : "0%" }}
              />
            </div>
            {bottlenecks.length > 0 && (
              <p className="flex items-start gap-1 text-sm text-amber-600">
                <WarningIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {bottlenecks.length} cuello(s) de botella: {bottlenecks.map((b) => b.title).join(", ")}
              </p>
            )}
            {delays.length > 0 && (
              <p className="text-sm text-red-600">
                {delays.length} tarea(s) con atraso propio ({delays.reduce((s, d) => s + d.delayDays, 0)} días
                hábiles en total)
              </p>
            )}
            {bottlenecks.length === 0 && delays.length === 0 && (
              <p className="text-sm text-slate-400">Sin cuellos de botella ni atrasos detectados.</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
