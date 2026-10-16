import { CheckIcon, DocumentCheckIcon, PaperclipIcon, ReviewChecklistIcon, UndoIcon } from "@/components/icons";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { REVIEW_STATES, TASK_STATUS_COLOR, TASK_STATUS_LABEL, TASK_TYPE_BADGE, type ReviewState } from "@/lib/statusColors";

/** Entregable con su evidencia cargada: etiqueta aparte, en el color del tipo (como «En revisión» en las Pruebas). */
export function EvidenceLoadedBadge({ className = "text-[11px]" }: { className?: string }) {
  return (
    <span className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium ${TASK_TYPE_BADGE.MILESTONE} ${className}`}>
      <DocumentCheckIcon className="h-3.5 w-3.5" />
      Evidencia cargada
    </span>
  );
}

/** «Devuelta»: mismo ícono y color que el aviso «Devoluciones» del encabezado. */
export function ReturnedBadge({ className = "text-[11px]" }: { className?: string }) {
  return (
    <span className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium ${TASK_STATUS_COLOR.RETURNED.badge} ${className}`}>
      <UndoIcon className="h-3.5 w-3.5" />
      {TASK_STATUS_LABEL.RETURNED}
    </span>
  );
}

/** Ícono que acompaña la etiqueta de estado donde ya se muestra como texto (hoy solo «Devuelta»). */
export function TaskStatusIcon({ status, className = "h-3.5 w-3.5" }: { status: string; className?: string }) {
  return status === "RETURNED" ? <UndoIcon className={`inline-block flex-shrink-0 align-[-0.2em] ${className}`} /> : null;
}

/** Ícono de un estado derivado de Prueba: el sello de «Revisiones» (en revisión) o un check (aprobada). */
export function ReviewStateIcon({ state, className = "h-3.5 w-3.5" }: { state: ReviewState; className?: string }) {
  return state === "IN_REVIEW" ? <ReviewChecklistIcon className={className} /> : <CheckIcon className={className} />;
}

/** «En revisión» / «Aprobada» (ver taskReviewState): etiqueta con ícono en el color de cada estado. */
export function ReviewStateBadge({ state, className = "text-[11px]" }: { state: ReviewState; className?: string }) {
  return (
    <span className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-medium ${REVIEW_STATES[state].color.badge} ${className}`}>
      <ReviewStateIcon state={state} />
      {REVIEW_STATES[state].label}
    </span>
  );
}

/**
 * Indicadores que TODA vista de tareas (Tablero, Gantt, Calendario, Agenda) muestra igual:
 * link compartido activo (clic = copiar) y cantidad de archivos adjuntos.
 */
export function TaskIndicators({ attachmentsCount = 0, shareToken, className = "" }: { attachmentsCount?: number; shareToken?: string | null; className?: string }) {
  if (!shareToken && attachmentsCount <= 0) return null;
  return (
    <span className={`inline-flex flex-shrink-0 items-center gap-1.5 ${className}`}>
      {shareToken && <CopyLinkButton token={shareToken} />}
      {attachmentsCount > 0 && (
        <span title={`${attachmentsCount} adjunto(s)`} className="flex items-center gap-0.5 text-xs text-slate-400">
          <PaperclipIcon className="h-3.5 w-3.5" />
          {attachmentsCount}
        </span>
      )}
    </span>
  );
}
