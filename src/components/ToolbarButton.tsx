import type { ReactNode } from "react";

// Mismo botón icono en cualquier barra de visor (AttachmentPreviewModal, el HTML incrustado del
// checklist en StepAttachments…) — un solo lugar para el tamaño, el hover y el estado danger/disabled.
export function toolbarButtonClass(danger = false) {
  return `flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-colors ${
    danger ? "text-red-600 hover:bg-red-50" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
  }`;
}

/** Botón icono de acción (para un <a>/<Link> propio, usar toolbarButtonClass() directo en su className). */
export function ToolbarButton({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`${toolbarButtonClass(danger)} disabled:pointer-events-none disabled:opacity-40`}
    >
      {icon}
    </button>
  );
}
