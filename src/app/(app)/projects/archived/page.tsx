import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { visibleProjectWhere } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getProjectSummaryRows } from "@/lib/projectSummaries";
import { ProjectSummaryGrid } from "../ProjectSummaryGrid";

// Historial: proyectos archivados (entregados/terminados). Fuera del flujo
// normal; se abren desde acá y se desarchivan desde su propia página.
// Mismo criterio de quién ve qué que la lista de /projects.
export default async function ArchivedProjectsPage({ searchParams }: { searchParams: Promise<{ pid?: string; health?: "ok" | "warn" | "bad"; schedule?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { pid, health, schedule } = await searchParams;

  const isAdmin = session.user.role === "ADMIN";
  const isPM = !isAdmin && (await prisma.project.count({ where: { pmId: session.user.id } })) > 0;
  const myAssignedProjectIds =
    isAdmin || isPM
      ? null
      : (
          await prisma.task.findMany({
            where: { assignees: { some: { userId: session.user.id } } },
            select: { projectId: true },
            distinct: ["projectId"],
          })
        ).map((t) => t.projectId);

  const [rows, users] = await Promise.all([
    getProjectSummaryRows(
      {
        ...visibleProjectWhere(session.user, { includeArchived: true }),
        archivedAt: { not: null },
        ...(myAssignedProjectIds ? { id: { in: myAssignedProjectIds } } : {}),
      },
      false
    ),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Proyectos archivados</h1>
        <Link href="/projects" className="text-sm text-slate-500 hover:text-slate-900">
          ← Proyectos
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No hay proyectos archivados.</p>
      ) : (
        <ProjectSummaryGrid rows={rows} basePath="/projects/archived" pid={pid} health={health} schedule={schedule} currentParams={{}} users={users} showCreateButton={false} />
      )}
    </div>
  );
}
