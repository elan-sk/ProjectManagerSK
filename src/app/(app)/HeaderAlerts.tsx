"use client";

import { AnchoredPopover, useAnchoredPopover } from "@/components/AnchoredPopover";
import Link from "next/link";
import { UndoIcon, ReviewChecklistIcon, UrgentIcon } from "@/components/icons";

export type HeaderAlertTask = { id: string; title: string; projectId: string; plannedEnd: string };

function dueLabel(iso: string) {
  const end = new Date(iso);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((end.getTime() - today.getTime()) / 86400000);
  const fmt = end.toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" });
  if (days < 0) return `venció el ${fmt}`;
  if (days === 0) return "vence hoy";
  return `vence el ${fmt}`;
}

// Un solo botón reutilizable para las dos alertas fijas del header
// (Devoluciones / Revisiones, punto 10 confirmado con el usuario): mismo
// mecanismo de popover que NotificationBell, pero la lista ya viene ordenada
// por urgencia desde el server (plannedEnd ascendente).
function AlertButton({
  icon,
  label,
  emptyLabel,
  colorClass,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  emptyLabel: string;
  colorClass: string;
  items: HeaderAlertTask[];
}) {
  const { anchorRef, panelRef, pos, toggle, close } = useAnchoredPopover(288);

  if (items.length === 0) return null;

  return (
    <div ref={anchorRef} className="relative">
      <button
        onClick={toggle}
        title={label}
        aria-label={label}
        className="relative rounded-full p-1.5 text-slate-500 hover:bg-white/20"
      >
        {icon}
        <span className={`absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium text-white ${colorClass}`}>
          {items.length}
        </span>
      </button>

      <AnchoredPopover pos={pos} panelRef={panelRef}>
          <p className="px-2 pb-1 pt-0.5 text-xs font-medium text-slate-500">{label}</p>
          {items.length === 0 ? (
            <p className="p-3 text-sm text-slate-400">{emptyLabel}</p>
          ) : (
            items.map((t) => (
              <Link
                key={t.id}
                href={`/projects/${t.projectId}/tasks/${t.id}`}
                onClick={close}
                className="block rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="block truncate">{t.title}</span>
                <span className="text-xs text-slate-400">{dueLabel(t.plannedEnd)}</span>
              </Link>
            ))
          )}
      </AnchoredPopover>
    </div>
  );
}

export function HeaderAlerts({ urgent, returned, pendingReviews }: { urgent: HeaderAlertTask[]; returned: HeaderAlertTask[]; pendingReviews: HeaderAlertTask[] }) {
  return (
    <>
      {/* Urgentes: la lista no tiene "descartar" — solo cambia al completar o desmarcar la tarea. */}
      <AlertButton
        icon={<UrgentIcon className="h-5 w-5 text-white" />}
        label="Tareas urgentes"
        emptyLabel="Sin tareas urgentes."
        colorClass="bg-red-600"
        items={urgent}
      />
      <AlertButton
        icon={<UndoIcon className="h-5 w-5" />}
        label="Devoluciones"
        emptyLabel="Sin tareas devueltas."
        colorClass="bg-orange-500"
        items={returned}
      />
      <AlertButton
        icon={<ReviewChecklistIcon className="h-5 w-5" />}
        label="Revisiones"
        emptyLabel="Nada pendiente por revisar."
        colorClass="bg-teal-500"
        items={pendingReviews}
      />
    </>
  );
}
