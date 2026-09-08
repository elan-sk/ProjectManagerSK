export type CollisionInfo = { taskId: string; projectName: string; title: string };

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
      if (!a.assigneeIds.some((id) => b.assigneeIds.includes(id))) continue;
      const overlaps = a.plannedStart <= b.plannedEnd && b.plannedStart <= a.plannedEnd;
      if (!overlaps) continue;
      add(a.id, { taskId: b.id, projectName: b.projectName, title: b.title });
      add(b.id, { taskId: a.id, projectName: a.projectName, title: a.title });
    }
  }

  return result;
}
