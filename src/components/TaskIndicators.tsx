import { PaperclipIcon } from "@/components/icons";
import { CopyLinkButton } from "@/components/CopyLinkButton";

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
