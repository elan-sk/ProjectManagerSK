"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { CopyIcon, UrgentIcon } from "@/components/icons";
import { duplicateTask, setTaskUrgent, unarchiveTask } from "../../taskOps";
import { ArchiveIcon } from "@/components/icons";

// Acciones de Admin/PM en el detalle de la tarea: marcar/quitar urgente y duplicar.
export function TaskOpsButtons({ taskId, projectId, isUrgent, completed, archived }: { taskId: string; projectId: string; isUrgent: boolean; completed: boolean; archived: boolean }) {
  const router = useRouter();
  const showToast = useToast();
  const [pending, setPending] = useState(false);

  async function urgent() {
    setPending(true);
    const result = await setTaskUrgent(taskId, !isUrgent);
    setPending(false);
    if (!result.ok) return showToast(result.error);
    showToast(isUrgent ? "Se quitó la urgencia." : "Tarea marcada como urgente. Se avisó al equipo por WhatsApp.", "success");
    router.refresh();
  }

  async function duplicate() {
    setPending(true);
    const result = await duplicateTask(taskId);
    setPending(false);
    if (!result.ok) return showToast(result.error);
    showToast("Tarea duplicada.", "success");
    router.push(`/projects/${projectId}/tasks/${result.id}`);
  }

  async function restore() {
    setPending(true);
    const result = await unarchiveTask(taskId);
    setPending(false);
    if (!result.ok) return showToast(result.error);
    showToast("La tarea volvió a Completada.", "success");
    router.refresh();
  }

  return (
    <>
      {archived && (
        <button type="button" disabled={pending} onClick={restore} title="Sacarla de archivadas: vuelve a la columna Completada" className="flex cursor-pointer items-center gap-1 rounded-lg border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60">
          <ArchiveIcon className="h-3.5 w-3.5" />
          Archivada · Volver a Completada
        </button>
      )}
      {!completed && (
        <button
          type="button"
          disabled={pending}
          onClick={urgent}
          className={`flex flex-shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${isUrgent ? "border-red-600 bg-red-600 text-white hover:bg-red-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
        >
          <UrgentIcon className="h-3.5 w-3.5" />
          {isUrgent ? "Quitar urgencia" : "Marcar urgente"}
        </button>
      )}
      <button type="button" disabled={pending} onClick={duplicate} className="flex flex-shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60">
        <CopyIcon className="h-3.5 w-3.5" />
        Duplicar
      </button>
    </>
  );
}
