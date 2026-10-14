// El filtro "Persona" (ComboFilter) usa un solo paramKey ("userId"): la opción
// «Sin asignar» es un valor reservado en esa misma URL. Un id de User real es
// un cuid, así que no hay colisión posible. Sin Prisma: lo usan páginas de servidor y cliente.
export const UNASSIGNED_ASSIGNEE_FILTER = "unassigned";

export const UNASSIGNED_ASSIGNEE_OPTION = { id: UNASSIGNED_ASSIGNEE_FILTER, label: "Sin asignar" };

export function matchesAssigneeFilter(filter: string | undefined, assignees: { userId: string }[]) {
  if (!filter) return true;
  if (filter === UNASSIGNED_ASSIGNEE_FILTER) return assignees.length === 0;
  return assignees.some((a) => a.userId === filter);
}
