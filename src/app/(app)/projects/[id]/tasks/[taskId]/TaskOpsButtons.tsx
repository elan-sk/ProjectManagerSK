"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { CopyIcon, UrgentIcon } from "@/components/icons";
import { duplicateTask, setTaskUrgent } from "../../taskOps";

// Acciones de Admin/PM en el detalle de la tarea: marcar/quitar urgente y duplicar.
export function TaskOpsButtons({ taskId, projectId, isUrgent, completed }: { taskId: string; projectId: string; isUrgent: boolean; completed: boolean }) {
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

  return (
    <>
      {!completed && (
        <button
          type="button"
          disabled={pending}
          onClick={urgent}
          className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${isUrgent ? "border-red-600 bg-red-600 text-white hover:bg-red-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
        >
          <UrgentIcon className="h-3.5 w-3.5" />
          {isUrgent ? "Quitar urgencia" : "Marcar urgente"}
        </button>
      )}
      <button type="button" disabled={pending} onClick={duplicate} className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60">
        <CopyIcon className="h-3.5 w-3.5" />
        Duplicar
      </button>
    </>
  );
}
