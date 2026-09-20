"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { setProjectHidden } from "./taskOps";

// Solo lo ve el administrador: oculta el proyecto para el resto del equipo
// (o lo vuelve a mostrar). Un proyecto oculto sigue visible para el admin.
export function HideProjectButton({ projectId, hidden }: { projectId: string; hidden: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!hidden && !(await confirm("¿Ocultar este proyecto? El resto del equipo dejará de verlo hasta que lo vuelvas a mostrar.", { confirmLabel: "Ocultar" }))) return;
    setPending(true);
    const result = await setProjectHidden(projectId, !hidden);
    setPending(false);
    if (!result.ok) return showToast(result.error);
    showToast(hidden ? "El proyecto vuelve a ser visible para el equipo." : "Proyecto oculto para el equipo.", "success");
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={toggle}
      title={hidden ? "Oculto para el equipo — clic para mostrarlo" : "Ocultar proyecto al equipo"}
      aria-label={hidden ? "Mostrar proyecto al equipo" : "Ocultar proyecto al equipo"}
      className={`rounded-lg border p-1.5 disabled:opacity-60 ${hidden ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
    >
      {hidden ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
    </button>
  );
}
