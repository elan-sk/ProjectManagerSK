import { prisma } from "@/lib/prisma";
import { visibleProjectWhere, type Actor } from "@/lib/permissions";

// Alertas del encabezado (urgentes, devueltas, por revisar). Las usan el header de la app y el
// resumen diario de WhatsApp, para que los dos cuenten lo mismo.
// "Devuelta" es pura mía (soy asignado); "Revisión" cuenta toda ronda activa donde soy revisor,
// tenga o no plantilla aplicada todavía. Urgentes: no completadas ni archivadas; admin ve todas, el
// resto las de los proyectos que administra o donde es asignado/revisor. Ordenadas por plannedEnd
// ascendente: primero lo más atrasado/próximo a vencer.
export async function getHeaderAlertTasks(user: Actor) {
  const uid = user.id;
  const select = { id: true, title: true, projectId: true, plannedEnd: true } as const;
  const orderBy = { plannedEnd: "asc" } as const;
  const [urgent, returned, pendingReviews] = await Promise.all([
    prisma.task.findMany({
      where: {
        isUrgent: true,
        status: { not: "COMPLETED" },
        archivedAt: null,
        project: visibleProjectWhere(user),
        ...(user.role === "ADMIN"
          ? {}
          : { OR: [{ project: { pmId: uid } }, { assignees: { some: { userId: uid } } }, { reviewers: { some: { userId: uid } } }] }),
      },
      select,
      orderBy,
    }),
    prisma.task.findMany({
      where: { status: "RETURNED", assignees: { some: { userId: uid } }, project: visibleProjectWhere(user) },
      select,
      orderBy,
    }),
    prisma.task.findMany({
      where: { reviewers: { some: { userId: uid } }, reviewRounds: { some: { outcome: null } }, project: visibleProjectWhere(user) },
      select,
      orderBy,
    }),
  ]);
  return { urgent, returned, pendingReviews };
}
