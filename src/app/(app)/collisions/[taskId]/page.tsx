import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findScheduleCollisions, findFreeUsers } from "@/lib/collisions";
import { ModalTrigger } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { ProjectIcon } from "@/components/ProjectIcon";
import { OverlapIcon } from "@/components/icons";
import { ReassignAssigneesForm } from "@/app/(app)/projects/[id]/tasks/[taskId]/ReassignAssigneesForm";

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };
const fmt = (d: Date) => d.toLocaleDateString("es-CO", DATE_FMT);

// Vista de detalle a la que solo se llega desde el ícono de colisión de las
// distintas vistas (tablero, Gantt, calendario, tarjeta de proyecto) —
// deliberadamente sin entrada en el menú. Agrega lo que el popover rápido no
// alcanza a mostrar: el período exacto del choque, quién carga con ambas
// tareas, y a quién más se le podría redirigir una de las dos.
export default async function CollisionDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { taskId } = await params;

  const anchorTask = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, name: true, iconUrl: true } },
      assignees: { include: { user: true } },
    },
  });
  if (!anchorTask) notFound();

  // Mismo criterio que "canSeeCollisions" en /projects: solo quien administra
  // algo ve colisiones — un miembro normal no llega ni por URL directa.
  const isAdmin = session.user.role === "ADMIN";
  const myPmProjectCount = isAdmin
    ? 0
    : await prisma.project.count({ where: { pmId: session.user.id } });
  const canManage = isAdmin || myPmProjectCount > 0;
  if (!canManage) redirect("/projects");

  const [allTasksRaw, allUsers] = await Promise.all([
    prisma.task.findMany({
      select: {
        id: true,
        projectId: true,
        title: true,
        status: true,
        plannedStart: true,
        plannedEnd: true,
        assignees: { select: { userId: true } },
        project: { select: { id: true, name: true, iconUrl: true } },
      },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, avatarUrl: true } }),
  ]);

  const collisionsById = findScheduleCollisions(
    allTasksRaw.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.project.name,
      title: t.title,
      status: t.status,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      assigneeIds: t.assignees.map((a) => a.userId),
    }))
  );
  const collisions = collisionsById.get(taskId) ?? [];

  const usersById = new Map(allUsers.map((u) => [u.id, u]));
  const tasksById = new Map(allTasksRaw.map((t) => [t.id, t]));
  const openTasks = allTasksRaw
    .filter((t) => t.status !== "COMPLETED")
    .map((t) => ({ assigneeIds: t.assignees.map((a) => a.userId), plannedStart: t.plannedStart, plannedEnd: t.plannedEnd }));
  const loadOf = (userId: string) => openTasks.filter((t) => t.assigneeIds.includes(userId)).length;
  const anchorAssigneeIds = anchorTask.assignees.map((a) => a.userId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/projects/${anchorTask.projectId}`} className="text-sm text-slate-500 hover:underline">
          ← {anchorTask.project.name}
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <OverlapIcon className="h-6 w-6 flex-shrink-0 text-indigo-500" />
          <h1 className="text-xl font-semibold text-slate-900">Colisiones de agenda</h1>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-indigo-300 bg-white p-3 shadow-[0_4px_16px_rgba(99,102,241,0.18)]">
          <div className="flex min-w-0 items-center gap-2">
            <ProjectIcon name={anchorTask.project.name} iconUrl={anchorTask.project.iconUrl} size="h-9 w-9 text-sm" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">Tarea analizada</p>
              <Link
                href={`/projects/${anchorTask.projectId}/tasks/${anchorTask.id}`}
                className="block truncate text-sm font-medium text-slate-900 hover:underline"
              >
                {anchorTask.title}
              </Link>
              <p className="text-xs text-slate-500">
                {anchorTask.project.name} · {fmt(anchorTask.plannedStart)} — {fmt(anchorTask.plannedEnd)}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {anchorTask.assignees.length === 0 ? (
                  <span className="text-xs text-slate-400">Sin asignados</span>
                ) : (
                  anchorTask.assignees.map((a) => (
                    <span key={a.userId} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Avatar name={a.user.name} avatarUrl={a.user.avatarUrl} size="h-5 w-5 text-[9px]" />
                      {a.user.name}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
          <ModalTrigger label="Reasignar" title="Reasignar tarea" variant="secondary" compact>
            <ReassignAssigneesForm taskId={anchorTask.id} currentAssigneeIds={anchorAssigneeIds} users={allUsers} />
          </ModalTrigger>
        </div>
      </div>

      {collisions.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Esta tarea ya no tiene colisiones de agenda — puede que ya la hayan reasignado.
        </p>
      ) : (
        <div className="space-y-4">
          {collisions.map((c) => {
            const otherTask = tasksById.get(c.taskId);
            const sharedUsers = c.sharedUserIds.map((id) => usersById.get(id)).filter((u) => u != null);
            const freeUsers = findFreeUsers(allUsers, openTasks, c.overlapStart, c.overlapEnd).filter(
              (u) => !anchorAssigneeIds.includes(u.id) && !otherTask?.assignees.some((a) => a.userId === u.id)
            );

            return (
              <div key={c.taskId} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ProjectIcon name={c.projectName} iconUrl={otherTask?.project.iconUrl ?? null} size="h-9 w-9 text-sm" />
                    <div className="min-w-0">
                      <Link
                        href={`/projects/${c.projectId}/tasks/${c.taskId}`}
                        className="block truncate text-sm font-medium text-slate-900 hover:underline"
                      >
                        {c.title}
                      </Link>
                      <p className="text-xs text-slate-500">{c.projectName}</p>
                    </div>
                  </div>
                  {otherTask && (
                    <ModalTrigger label="Reasignar" title="Reasignar tarea" variant="secondary" compact>
                      <ReassignAssigneesForm
                        taskId={otherTask.id}
                        currentAssigneeIds={otherTask.assignees.map((a) => a.userId)}
                        users={allUsers}
                      />
                    </ModalTrigger>
                  )}
                </div>

                <p className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700">
                  Se pisan del {fmt(c.overlapStart)} al {fmt(c.overlapEnd)}
                </p>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-400">Quién carga con las dos</p>
                  <div className="flex flex-wrap gap-3">
                    {sharedUsers.map((u) => (
                      <div key={u.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                        <Avatar name={u.name} avatarUrl={u.avatarUrl} size="h-6 w-6 text-[10px]" />
                        {u.name}
                        <span className="text-xs text-slate-400">· {loadOf(u.id)} tarea(s) abierta(s) en total</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-400">Personal libre en ese período</p>
                  {freeUsers.length === 0 ? (
                    <p className="text-xs text-slate-400">Nadie más está libre en ese rango.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {freeUsers.map((u) => (
                        <span
                          key={u.id}
                          className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
                        >
                          <Avatar name={u.name} avatarUrl={u.avatarUrl} size="h-5 w-5 text-[9px]" />
                          {u.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
