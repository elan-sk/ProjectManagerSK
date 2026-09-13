"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { archiveProject } from "./actions";

// El botón dice "Eliminar" (así lo entiende el equipo) pero por dentro
// archiva en vez de borrar de verdad — ver el comentario en archiveProject
// (actions.ts) sobre por qué un borrado en cascada colgaba toda la app.
//
// El confirm() se llama AFUERA de cualquier startTransition/useTransition a
// propósito: es una espera por una acción del usuario (click en el modal),
// no una actualización de estado — meterlo dentro de una transición hace
// que React nunca llegue a pintar el modal (se reprodujo así en pruebas
// locales: el botón quedaba en "Eliminando…" para siempre sin que apareciera
// nada). Mismo patrón que ya usa el resto de la app (ver ProjectLinksPanel).
export function ArchiveProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const [isPending, setIsPending] = useState(false);

  async function handleDelete() {
    const ok = await confirm(`¿Eliminar el proyecto "${projectName}"? No lo vas a volver a ver ni a poder usar.`, {
      confirmLabel: "Eliminar proyecto",
      danger: true,
    });
    if (!ok) return;

    setIsPending(true);
    const result = await archiveProject(projectId);
    if (!result.ok) {
      setIsPending(false);
      showToast(result.error ?? "No se pudo eliminar el proyecto.");
      return;
    }
    showToast(`Se eliminó el proyecto "${projectName}".`, "success");
    router.push("/projects");
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleDelete}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
    >
      {isPending ? "Eliminando…" : "Eliminar proyecto"}
    </button>
  );
}
