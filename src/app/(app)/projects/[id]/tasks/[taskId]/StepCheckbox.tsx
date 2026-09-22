"use client";

import { Linkify } from "@/lib/linkify";
import { useEffect, useRef, useState } from "react";
import { avatarColor } from "@/components/Avatar";
import { BoldButton, boldOnKeyDown } from "@/components/BoldButton";
import { PaperclipIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { removeStep, toggleStep, updateStep } from "./actions";
import { StepAttachments, type StepAttachmentsHandle } from "./StepAttachments";
import type { AttachmentGridItem } from "./AttachmentGrid";

/**
 * Un solo botón "adjuntar" al final del paso (junto a Editar/Eliminar) en vez de los dos botones
 * + Archivo / + Link permanentes de antes, que ensuciaban visualmente cada paso — despliega las
 * mismas dos opciones en un menú chico. Mismo patrón de click-afuera-cierra que InternalMessageBell.
 */
function StepAttachMenu({ onFile, onLink, disabled }: { onFile: () => void; onLink: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Adjuntar archivo o link"
        aria-label="Adjuntar archivo o link"
        className="text-slate-400 hover:text-slate-700 hover:underline disabled:opacity-40"
      >
        <PaperclipIcon className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="pacific-popover absolute top-full right-0 z-10 mt-1 w-28 rounded-lg bg-white p-1 text-left shadow-[0_8px_24px_rgba(15,23,42,.12)]">
          <button type="button" onClick={() => { onFile(); setOpen(false); }} className="block w-full cursor-pointer rounded px-2 py-1 text-left text-xs text-slate-600 hover:bg-slate-100">
            Archivo
          </button>
          <button type="button" onClick={() => { onLink(); setOpen(false); }} className="block w-full cursor-pointer rounded px-2 py-1 text-left text-xs text-slate-600 hover:bg-slate-100">
            Link
          </button>
        </div>
      )}
    </div>
  );
}

export function StepCheckbox({
  stepId,
  description,
  done,
  canEdit,
  canAddFiles,
  attachments,
  dragHandle,
}: {
  stepId: string;
  description: string;
  done: boolean;
  canEdit: boolean;
  /** Se pueden subir archivos/links al paso (la tarea no está completada). */
  canAddFiles: boolean;
  /** Archivos, imágenes y links subidos desde este paso. */
  attachments: AttachmentGridItem[];
  /** Asa de arrastre (la pone StepList) — se pinta antes del checkbox. */
  dragHandle?: React.ReactNode;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<StepAttachmentsHandle>(null);
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

  // Franja de color propia del paso (mismo generador que Avatar): ata visualmente su checkbox con todo
  // lo que cuelga de él — archivos, links y el HTML incrustado — y separa un paso del siguiente en la lista.
  const accentColor = avatarColor(stepId);

  return (
    // data-paste-zone en TODO el paso (no solo en el bloque de archivos): Ctrl+V con una captura
    // funciona con el mouse en cualquier parte del paso, no solo sobre los botones + Archivo/+ Link.
    <div data-paste-zone className="space-y-1.5 rounded-r-lg border-l-[3px] py-0.5 pl-2.5" style={{ borderLeftColor: accentColor }}>
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
            {canAddFiles && (
              <>
                <StepAttachMenu
                  disabled={busy}
                  onFile={() => attachRef.current?.openFilePicker()}
                  onLink={() => attachRef.current?.openLinkForm()}
                />
                {/* Separador propio: evita presionar "Editar" sin querer al ir a buscar el clip. */}
                <span className="h-4 w-px bg-slate-200" aria-hidden />
              </>
            )}
            <button type="button" disabled={busy} onClick={() => setEditing(true)} className="text-slate-400 hover:text-slate-700 hover:underline">Editar</button>
            <button type="button" disabled={busy} onClick={deleteStep} className="text-slate-400 hover:text-red-600 hover:underline">Eliminar</button>
          </div>
        )}
      </div>
      <StepAttachments ref={attachRef} stepId={stepId} attachments={attachments} canEdit={canEdit} canAdd={canEdit && canAddFiles} />
      {error && <p className="pl-6 text-xs text-red-600">{error}</p>}
    </div>
  );
}
