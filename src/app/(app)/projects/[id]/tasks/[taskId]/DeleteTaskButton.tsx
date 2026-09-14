"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTask } from "./actions";
import { useConfirm } from "@/components/Confirm";
import { hrefWithMemory } from "../../../../NavLinkWithMemory";

export function DeleteTaskButton({
  taskId,
  projectId,
  title,
  compact = false,
}: {
  taskId: string;
  projectId: string;
  title: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const ok = await confirm(`¿Seguro que querés eliminar la tarea "${title}"? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTask(taskId);
      // Punto confirmado con el usuario: volver a la MISMA vista del
      // proyecto de la que vino (Tablero/Gantt/Calendario/etc., con sus
      // filtros) — router.back() resultó frágil (cualquier filtro o
      // refresh de por medio en el historial real podía hacer que "atrás"
      // no cayera ahí), así que se reusa la misma memoria de vista que ya
      // usa el link "← proyecto" de esta página (RememberViewState).
      if (result.ok) router.push(hrefWithMemory(`/projects/${projectId}`, `project:${projectId}`));
      else setError(result.error ?? "No se pudo eliminar la tarea.");
    });
  }

  return (
    <div className={compact ? "ml-2" : "ml-3 space-y-1"}>
      <button
        type="button"
        onClick={handleDelete}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={isPending}
        className={
          compact
            ? "text-xs font-medium text-slate-400 hover:text-red-600 disabled:opacity-60"
            : "text-sm font-medium text-red-600 hover:underline disabled:opacity-60"
        }
      >
        {isPending ? "Eliminando…" : "Eliminar tarea"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
