"use client";

import { Linkify } from "@/lib/linkify";
import { useRef, useState } from "react";
import { BoldButton, boldOnKeyDown } from "@/components/BoldButton";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { removeStep, toggleStep, updateStep } from "./actions";

export function StepCheckbox({
  stepId,
  description,
  done,
  canEdit,
  dragHandle,
}: {
  stepId: string;
  description: string;
  done: boolean;
  canEdit: boolean;
  /** Asa de arrastre (la pone StepList) — se pinta antes del checkbox. */
  dragHandle?: React.ReactNode;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveDescription() {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateStep(stepId, value);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "No se pudo editar el paso.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteStep() {
    const accepted = await confirm(`¿Eliminar el paso "${description}"? Esta acción no se puede deshacer.`, { confirmLabel: "Eliminar", danger: true });
    if (!accepted) return;
    setBusy(true);
    try {
      await removeStep(stepId);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "No se pudo eliminar el paso.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-2 text-sm text-slate-700 ${canEdit ? "" : "cursor-default"}`}>
        {dragHandle}
        <input
          type="checkbox"
          checked={done}
          disabled={!canEdit || busy}
          onChange={async (e) => {
            setBusy(true);
            try {
              await toggleStep(stepId, e.target.checked);
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
          className="h-4 w-4 rounded border-slate-300 disabled:opacity-50"
        />
        {editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (boldOnKeyDown(e)) return; if (e.key === "Enter") saveDescription(); }} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm" autoFocus />
            <BoldButton targetRef={inputRef} />
            <button type="button" disabled={busy || !value.trim()} onClick={saveDescription} className="text-xs font-medium text-slate-700 hover:underline disabled:opacity-50">Guardar</button>
            <button type="button" disabled={busy} onClick={() => { setValue(description); setEditing(false); }} className="text-xs text-slate-400 hover:underline">Cancelar</button>
          </div>
        ) : (
          <span className={`min-w-0 flex-1 ${done ? "text-slate-400 line-through" : ""}`}><Linkify text={description} /></span>
        )}
        {canEdit && !editing && (
          <div className="flex flex-shrink-0 items-center gap-2 text-xs">
            <button type="button" disabled={busy} onClick={() => setEditing(true)} className="text-slate-400 hover:text-slate-700 hover:underline">Editar</button>
            <button type="button" disabled={busy} onClick={deleteStep} className="text-slate-400 hover:text-red-600 hover:underline">Eliminar</button>
          </div>
        )}
      </div>
      {error && <p className="pl-6 text-xs text-red-600">{error}</p>}
    </div>
  );
}
