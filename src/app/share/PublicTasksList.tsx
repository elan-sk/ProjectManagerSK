import { PublicTaskCard } from "./PublicTaskCard";
import type { PublicTask } from "@/lib/publicView";

/** Versión resumida de la vista de tareas (punto 1.1) — agrupadas por fase. */
export function PublicTasksList({ tasks, phases }: { tasks: PublicTask[]; phases: { id: string; name: string }[] }) {
  return (
    <div className="space-y-6">
      {phases.map((phase) => {
        const phaseTasks = tasks.filter((t) => t.phaseName === phase.name);
        if (phaseTasks.length === 0) return null;
        return (
          <div key={phase.id} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">{phase.name}</h2>
            <div className="space-y-2">
              {phaseTasks.map((t) => (
                <PublicTaskCard key={t.id} task={t} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
