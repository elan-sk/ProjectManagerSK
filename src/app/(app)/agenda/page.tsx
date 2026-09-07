import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { TaskStatus } from "@prisma/client";

const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Sin iniciar",
  IN_PROGRESS: "En curso",
  BLOCKED: "Bloqueada",
  COMPLETED: "Completada",
};

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; status?: TaskStatus }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { projectId, status } = await searchParams;

  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: {
        assignees: { some: { userId: session.user.id } },
        projectId: projectId || undefined,
        status: status || undefined,
      },
      include: { project: true, phase: true },
      orderBy: { plannedStart: "asc" },
    }),
    prisma.project.findMany({
      where: { tasks: { some: { assignees: { some: { userId: session.user.id } } } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Mi agenda</h1>

      <div className="flex flex-wrap gap-2 text-sm">
        <FilterLink label="Todos los proyectos" active={!projectId} href="/agenda" />
        {projects.map((p) => (
          <FilterLink
            key={p.id}
            label={p.name}
            active={projectId === p.id}
            href={`/agenda?projectId=${p.id}${status ? `&status=${status}` : ""}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <FilterLink
          label="Cualquier estado"
          active={!status}
          href={`/agenda${projectId ? `?projectId=${projectId}` : ""}`}
        />
        {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
          <FilterLink
            key={s}
            label={STATUS_LABEL[s]}
            active={status === s}
            href={`/agenda?status=${s}${projectId ? `&projectId=${projectId}` : ""}`}
          />
        ))}
      </div>

      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {tasks.length === 0 && (
          <li className="p-4 text-sm text-slate-500">No tenés tareas asignadas con estos filtros.</li>
        )}
        {tasks.map((t) => (
          <li key={t.id}>
            <Link
              href={`/projects/${t.projectId}/tasks/${t.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
            >
              <div>
                <p className="font-medium text-slate-900">{t.title}</p>
                <p className="text-sm text-slate-500">
                  {t.project.name} · {t.phase.name} · desde {t.plannedStart.toLocaleDateString("es-CO")}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                {STATUS_LABEL[t.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
    >
      {label}
    </Link>
  );
}
