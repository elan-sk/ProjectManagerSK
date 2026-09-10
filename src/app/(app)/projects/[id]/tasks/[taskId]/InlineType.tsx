"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskType } from "./actions";
import { TASK_TYPE_LABEL } from "@/lib/statusColors";

// Dropdown propio (no <select> nativo) — mismo mecanismo de click-afuera que
// ya usa SearchableSelect/ReferencePopover en este proyecto. El <select>
// nativo se venía cerrando solo apenas se abría (bug real reportado por el
// usuario): su popup lo renderiza el sistema operativo, no la página, así
// que ni el foco ni el blur del DOM son confiables para saber si sigue
// abierto. Con un dropdown 100% en DOM ese problema desaparece de raíz.
export function InlineType({ taskId, type, canManage }: { taskId: string; type: string; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLSpanElement>(null);
  const label = TASK_TYPE_LABEL[type] ?? type;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (!canManage) return <>{label}</>;

  function choose(value: string) {
    setOpen(false);
    startTransition(async () => {
      await updateTaskType(taskId, value);
      router.refresh();
    });
  }

  return (
    <span ref={rootRef} className="relative inline-block">
      <button
        type="button"
        title="Click para cambiar el tipo"
        disabled={isPending}
        onClick={() => setOpen((o) => !o)}
        className="-mx-0.5 rounded px-0.5 hover:bg-slate-100 hover:underline disabled:opacity-60"
      >
        {label}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-xl bg-white p-1 text-left shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]">
          {Object.entries(TASK_TYPE_LABEL).map(([value, l]) => (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              className={`block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${
                value === type ? "font-medium text-slate-900" : "text-slate-600"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
