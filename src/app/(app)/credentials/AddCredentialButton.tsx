"use client";

import { ModalTrigger } from "@/components/Modal";
import { KeyIcon } from "@/components/icons";
import type { CredentialPlace } from "@/lib/credentialPlace";
import { CredentialForm } from "./CredentialForm";

/** «+ Contraseña»: abre el formulario para crear una contraseña en el proyecto, una tarea, un paso o un ajuste. */
export function AddCredentialButton({ place, className }: { place: CredentialPlace; className?: string }) {
  return (
    <ModalTrigger
      label="+ Contraseña"
      title="Nueva contraseña"
      icon={<KeyIcon className="h-3.5 w-3.5" />}
      className={className ?? "inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-slate-400"}
    >
      <CredentialForm place={place} />
    </ModalTrigger>
  );
}
