export type CollisionInfo = {
  taskId: string;
  projectId: string;
  projectName: string;
  title: string;
  // Rango exacto donde se pisan ambas tareas y los usuarios que causan el
  // choque — lo necesita la vista de detalle (/collisions/[taskId]) para
  // saber "en qué período" y "quién" sin tener que recalcularlo ahí.
  overlapStart: Date;
  overlapEnd: Date;
  sharedUserIds: string[];
};

export type CollisionInput = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  status: string;
  plannedStart: Date;
  plannedEnd: Date;
  assigneeIds: string[];
};

// Colisión de agenda (no es un atraso ni un riesgo): la MISMA persona con 2+
// tareas simultáneas en proyectos DISTINTOS — no es grave (a veces se
// trabaja así a propósito), es solo para tenerlo presente. Solo tiene
// sentido entre proyectos distintos y con tareas todavía abiertas.
// ponytail: O(n²) sobre las tareas abiertas — si el tablero multi-proyecto
// crece a miles de tareas activas, agrupar primero por asignado antes de
// comparar pares.
export function findScheduleCollisions(tasks: CollisionInput[]): Map<string, CollisionInfo[]> {
  const result = new Map<string, CollisionInfo[]>();
  const open = tasks.filter((t) => t.status !== "COMPLETED");

  function add(taskId: string, info: CollisionInfo) {
    const list = result.get(taskId);
    if (list) list.push(info);
    else result.set(taskId, [info]);
  }

  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i];
      const b = open[j];
      if (a.projectId === b.projectId) continue;
      const sharedUserIds = a.assigneeIds.filter((id) => b.assigneeIds.includes(id));
      if (sharedUserIds.length === 0) continue;
      const overlaps = a.plannedStart <= b.plannedEnd && b.plannedStart <= a.plannedEnd;
      if (!overlaps) continue;
      const overlapStart = a.plannedStart > b.plannedStart ? a.plannedStart : b.plannedStart;
      const overlapEnd = a.plannedEnd < b.plannedEnd ? a.plannedEnd : b.plannedEnd;
      add(a.id, { taskId: b.id, projectId: b.projectId, projectName: b.projectName, title: b.title, overlapStart, overlapEnd, sharedUserIds });
      add(b.id, { taskId: a.id, projectId: a.projectId, projectName: a.projectName, title: a.title, overlapStart, overlapEnd, sharedUserIds });
    }
  }

  return result;
}

// Personal sin ninguna tarea abierta que se pise con [rangeStart, rangeEnd]
// — candidatos a los que redirigir una de las dos tareas en colisión.
export function findFreeUsers<U extends { id: string }>(
  users: U[],
  openTasks: { assigneeIds: string[]; plannedStart: Date; plannedEnd: Date }[],
  rangeStart: Date,
  rangeEnd: Date
): U[] {
  const busyUserIds = new Set(
    openTasks.filter((t) => t.plannedStart <= rangeEnd && rangeStart <= t.plannedEnd).flatMap((t) => t.assigneeIds)
  );
  return users.filter((u) => !busyUserIds.has(u.id));
}
