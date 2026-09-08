import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTaskAlert } from "@/lib/delays";
import { AlertBadge } from "@/components/AlertBadge";
import { ComboFilter } from "@/components/ComboFilter";
import { StatusFilterPill } from "@/components/StatusFilterPill";
import { TASK_STATUS_LABEL, TASK_STATUS_COLOR, taskCardTint } from "@/lib/statusColors";
import { RememberViewState } from "../RememberViewState";
import type { TaskStatus } from "@prisma/client";

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", timeZone: "UTC" };

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; status?: TaskStatus; userId?: string; risk?: "overdue" | "warning" }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { projectId, status, userId, risk } = await searchParams;

  // Ver la agenda de otra persona es un privilegio de PM/admin: un miembro
  // normal solo puede ver sus propias tareas, sin importar qué userId venga
  // en la URL. Un PM además queda acotado a los proyectos que administra —
  // no a cualquier proyecto de la app.
  const isAdmin = session.user.role === "ADMIN";
  const pmProjectIds = isAdmin
    ? null
    : (await prisma.project.findMany({ where: { pmId: session.user.id }, select: { id: true } })).map((p) => p.id);
  const viewingOther = Boolean(userId && userId !== session.user.id);
  const canViewOthers = isAdmin || Boolean(pmProjectIds && pmProjectIds.length > 0);
  const effectiveUserId = viewingOther && canViewOthers ? userId! : session.user.id;
  const scopedProjectIds =
    viewingOther && canViewOthers && !isAdmin
      ? projectId
        ? pmProjectIds!.includes(projectId)
          ? [projectId]
          : []
        : pmProjectIds!
      : null;

  const [tasksRaw, projects, users] = await Promise.all([
    prisma.task.findMany({
      where: {
        assignees: { some: { userId: effectiveUserId } },
        projectId: scopedProjectIds ? { in: scopedProjectIds } : projectId || undefined,
        status: status || undefined,
      },
      include: { project: true, phase: true },
      orderBy: { plannedStart: "asc" },
    }),
    prisma.project.findMany({
      where: { tasks: { some: { assignees: { some: { userId: session.user.id } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const tasksWithAlert = await Promise.all(
    tasksRaw.map(async (t) => ({ ...t, alert: await getTaskAlert(t.project.countryCode, t) }))
  );
  const tasks = risk ? tasksWithAlert.filter((t) => t.alert.level === risk) : tasksWithAlert;

  function agendaHref(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const merged: Record<string, string | undefined> = { projectId, status, userId, risk, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/agenda?${p.toString()}`;
  }

  return (
    <div className="space-y-4">
      <RememberViewState storageKey="lastAgendaView" />
      <h1 className="text-2xl font-semibold text-slate-900">Agenda</h1>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ComboFilter
          allLabel="Todos los proyectos"
          value={projectId}
          options={projects.map((p) => ({ id: p.id, label: p.name }))}
          paramKey="projectId"
          basePath="/agenda"
          currentParams={{ status, userId, risk }}
        />
        {canViewOthers && (
          <ComboFilter
            allLabel="Todas las personas"
            value={userId}
            options={users.map((u) => ({ id: u.id, label: u.name }))}
            paramKey="userId"
            basePath="/agenda"
            currentParams={{ projectId, status, risk }}
          />
        )}
        <FilterLink label="Cualquier estado" active={!status} href={agendaHref({ status: undefined })} />
        {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => (
          <StatusFilterPill key={s} status={s} active={status === s} href={agendaHref({ status: s })} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FilterLink label="Cualquier alerta" active={!risk} href={agendaHref({ risk: undefined })} />
        <Link
          href={agendaHref({ risk: "overdue" })}
          className={`rounded-lg px-3 py-1.5 font-medium ${risk === "overdue" ? "bg-red-600 text-white" : "bg-red-50 text-red-700 hover:brightness-95"}`}
        >
          Con retraso
        </Link>
        <Link
          href={agendaHref({ risk: "warning" })}
          className={`rounded-lg px-3 py-1.5 font-medium ${risk === "warning" ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700 hover:brightness-95"}`}
        >
          Por vencer
        </Link>
      </div>

      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {tasks.length === 0 && (
          <li className="p-4 text-sm text-slate-500">
            {viewingOther && canViewOthers
              ? `${users.find((u) => u.id === userId)?.name ?? "Esa persona"} no tiene tareas asignadas con estos filtros.`
              : "No tenés tareas asignadas con estos filtros."}
          </li>
        )}
        {tasks.map((t) => (
          <li key={t.id}>
            <Link
              href={`/projects/${t.projectId}/tasks/${t.id}`}
              className={`flex items-center justify-between px-4 py-3 hover:brightness-95 ${taskCardTint(t.status, t.alert.level)}`}
            >
              <div>
                <p className="font-medium text-slate-900">{t.title}</p>
                <p className="text-sm text-slate-500">
                  {t.project.name} · {t.phase.name} · {t.plannedStart.toLocaleDateString("es-CO", DATE_FMT)} —{" "}
                  {t.plannedEnd.toLocaleDateString("es-CO", DATE_FMT)}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <AlertBadge alert={t.alert} />
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${TASK_STATUS_COLOR[t.status].badge}`}>
                  {TASK_STATUS_LABEL[t.status]}
                </span>
              </div>
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
