type Phase = { id: string };
type Requirement = { id: string; phases: Phase[] };
type Objective = { id: string; requirementIds: string[] };

export function orderDefinitionBySchedule<O extends Objective, R extends Requirement, P extends Phase>(
  definition: { objectives: O[]; requirements: R[]; phases: P[] },
  tasks: { phaseId: string | null; plannedStart: Date }[],
) {
  const phaseStart = new Map<string, number>();
  for (const task of tasks) {
    if (!task.phaseId) continue;
    phaseStart.set(task.phaseId, Math.min(phaseStart.get(task.phaseId) ?? Infinity, task.plannedStart.getTime()));
  }
  const earliest = (ids: string[], dates: Map<string, number>) =>
    ids.reduce((start, id) => Math.min(start, dates.get(id) ?? Infinity), Infinity);
  const requirementStart = new Map(definition.requirements.map((r) => [r.id, earliest(r.phases.map((p) => p.id), phaseStart)]));
  const objectiveStart = new Map(definition.objectives.map((o) => [o.id, earliest(o.requirementIds, requirementStart)]));

  // Stable ties preserve the configured order; undated items follow scheduled items.
  function chronological<T extends { id: string }>(items: T[], dates: Map<string, number>): T[] {
    return [...items].sort((a, b) => {
      const startA = dates.get(a.id) ?? Infinity;
      const startB = dates.get(b.id) ?? Infinity;
      return startA === startB ? 0 : startA < startB ? -1 : 1;
    });
  }

  return {
    objectives: chronological(definition.objectives, objectiveStart),
    requirements: chronological(definition.requirements, requirementStart),
    phases: chronological(definition.phases, phaseStart),
  };
}
