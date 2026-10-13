"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskRequirements } from "./actions";
import { SearchableCheckList } from "@/components/SearchableCheckList";
import { useToast } from "@/components/Toast";

export function InlineRequirement({
  taskId,
  requirementIds,
  requirements,
  canManage,
  triggerClassName = "-mx-0.5 rounded px-0.5 text-left hover:bg-slate-100 hover:underline",
}: {
  taskId: string;
  requirementIds: string[];
  requirements: { id: string; title: string }[];
  canManage: boolean;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const current = isPending && draft ? draft : requirementIds;
  const titles = requirements.filter((r) => current.includes(r.id)).map((r) => r.title);
  const label = titles.length === 0 ? "Sin requerimiento" : titles.length === 1 ? titles[0] : `${titles[0]} +${titles.length - 1}`;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // El popup nace alineado a la izquierda del texto; si así se sale por la derecha (celular), se corre
  // hacia la izquierda lo justo para quedar dentro de la pantalla.
  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!open || !popup) return;
    popup.style.left = "0px";
    const overflow = popup.getBoundingClientRect().right - (window.innerWidth - 8);
    if (overflow > 0) popup.style.left = `${-overflow}px`;
  }, [open]);

  if (!canManage) return <span title={titles.join("\n")}>{label}</span>;

  function change(next: string[]) {
    setDraft(next);
    startTransition(async () => {
      try {
        const result = await updateTaskRequirements(taskId, next);
        if (!result.ok) showToast(result.error ?? "No se pudieron cambiar los requerimientos.");
      } catch {
        showToast("No se pudieron cambiar los requerimientos. Conviene intentarlo de nuevo.");
      }
      router.refresh();
    });
  }

  return (
    <span ref={rootRef} className="relative block min-w-0">
      <button
        type="button"
        title={titles.length > 0 ? titles.join("\n") : "Click para elegir los requerimientos"}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {label}
      </button>

      {open && (
        <div ref={popupRef} className="absolute left-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-2 text-left font-normal shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]">
          <SearchableCheckList options={requirements.map((r) => ({ id: r.id, label: r.title }))} selectedIds={current} onChange={change} />
        </div>
      )}
    </span>
  );
}
