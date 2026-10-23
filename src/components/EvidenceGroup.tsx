import type { ReactNode } from "react";

// Grupo de evidencias con su rótulo corto (Revisor / Entrega / Respuesta), en Pruebas y Aceptaciones.
export function EvidenceGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {children}
    </div>
  );
}
