"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { ArchiveIcon } from "@/components/icons";
import { setProjectArchived } from "./taskOps";

// Archivar = mandar al historial (proyecto entregado/terminado). No es el
// «Eliminar» de ArchiveProjectButton: se desarchiva cuando haga falta.
import { subprojectsNote } from "@/lib/subprojects";
export function ArchiveToggleButton({ projectId, archived, openTaskCount, subprojectCount = 0 }: { projectId: string; archived: boolean; openTaskCount: number; subprojectCount?: number }) {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!archived) {
      const pendingNote = openTaskCount > 0 ? ` Todavía tiene ${openTaskCount} tarea(s) sin completar.` : "";
      const message = `¿Archivar este proyecto? Dejará de aparecer en la lista, el buscador, la agenda, los reportes y las alertas; quedará en «Archivados».${pendingNote}${subprojectsNote(subprojectCount, "archivará")}`;
      if (!(await confirm(message, { confirmLabel: "Archivar" }))) return;
    }
    setPending(true);
    const result = await setProjectArchived(projectId, !archived);
    setPending(false);
    if (!result.ok) return showToast(result.error);
    showToast(archived ? "El proyecto volvió al flujo normal." : "Proyecto archivado.", "success");
    router.refresh();
  }

  // Sin archivar: ícono solo, igual que ocultar/eliminar. En el aviso de archivado: «Desarchivar» con texto.
  if (!archived) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={toggle}
        title="Archivar proyecto"
        aria-label="Archivar proyecto"
        className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        <ArchiveIcon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={toggle}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      <ArchiveIcon className="h-3.5 w-3.5" />
      Desarchivar
    </button>
  );
}
