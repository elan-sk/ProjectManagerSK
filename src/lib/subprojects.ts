// Subproyectos (spec 004): reglas puras de la jerarquía padre → hijos (dos niveles).
// Sin Prisma a propósito: así se prueban con scripts/verify-subprojects.ts.

type Node = { id: string; parentId: string | null };

/**
 * ¿Puede `child` quedar como hijo de `parent`? Devuelve el motivo en lenguaje simple, o null si se puede.
 * Solo dos niveles: un hijo no tiene hijos y un padre no tiene padre.
 */
export function parentLinkError(
  child: Node & { childrenCount: number },
  parent: Node & { live: boolean } | null
): string | null {
  if (!parent || !parent.live) return "El proyecto principal no existe o no está activo.";
  if (child.id === parent.id) return "Un proyecto no puede ser subproyecto de sí mismo.";
  if (parent.parentId) return "Un subproyecto no puede tener subproyectos propios.";
  if (child.childrenCount > 0) return "Este proyecto ya tiene subproyectos, así que no puede ser subproyecto de otro.";
  if (child.parentId && child.parentId !== parent.id) return "Este proyecto ya es subproyecto de otro. Primero hay que quitarlo de ese grupo.";
  return null;
}

/**
 * Filtro «Proyecto»: elegir un padre incluye a sus hijos; elegir un hijo (o un independiente), solo ese.
 * Sin selección devuelve null (= todos).
 */
export function expandProjectFilter(selected: string | undefined, projects: Node[]): Set<string> | null {
  if (!selected) return null;
  return new Set([selected, ...projects.filter((p) => p.parentId === selected).map((p) => p.id)]);
}

/**
 * Opciones del filtro «Proyecto»: cada padre seguido de sus hijos («Padre › Hijo»). Un hijo cuyo padre
 * no está en la lista sale igual con el nombre del padre si se conoce.
 */
export function projectFilterOptions(
  projects: (Node & { name: string; parentName?: string | null })[]
): { id: string; label: string }[] {
  const ids = new Set(projects.map((p) => p.id));
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "es");
  const out: { id: string; label: string }[] = [];
  for (const p of projects.filter((x) => !x.parentId || !ids.has(x.parentId)).sort(byName)) {
    out.push({ id: p.id, label: p.parentId && p.parentName ? `${p.parentName} › ${p.name}` : p.name });
    for (const c of projects.filter((x) => x.parentId === p.id).sort(byName)) out.push({ id: c.id, label: `${p.name} › ${c.name}` });
  }
  return out;
}

/**
 * Listas de proyectos (Vista resumen, Mis proyectos): un hijo no sale en su propia fila si su padre ya
 * está en la lista (se ve dentro del grupito del padre). Devuelve las filas visibles y los hijos de cada padre.
 */
export function groupRows<T extends Node>(rows: T[]): { visible: T[]; childrenOf: Map<string, T[]> } {
  const ids = new Set(rows.map((r) => r.id));
  const childrenOf = new Map<string, T[]>();
  for (const r of rows) if (r.parentId && ids.has(r.parentId)) (childrenOf.get(r.parentId) ?? childrenOf.set(r.parentId, []).get(r.parentId)!).push(r);
  return { visible: rows.filter((r) => !r.parentId || !ids.has(r.parentId)), childrenOf };
}

/** Peor retraso u holgura del grupo (el número más bajo); null si nadie tiene fecha de cierre. */
export function worstVariance(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length > 0 ? Math.min(...nums) : null;
}

/** Aviso de cascada en las confirmaciones (RF-28): « También se archivarán sus 3 subproyectos.» */
export function subprojectsNote(count: number, verb: string): string {
  if (count <= 0) return "";
  return count === 1 ? ` También se ${verb} su subproyecto.` : ` También se ${verb}n sus ${count} subproyectos.`;
}
