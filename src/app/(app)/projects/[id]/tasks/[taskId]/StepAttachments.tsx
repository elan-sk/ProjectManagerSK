"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadWithProgress } from "@/lib/uploadWithProgress";
import { usePasteImage } from "@/lib/usePasteImage";
import { useConfirm } from "@/components/Confirm";
import { AttachmentPreviewModal } from "@/components/AttachmentPreviewModal";
import { ToolbarButton } from "@/components/ToolbarButton";
import { ExpandIcon, TrashIcon } from "@/components/icons";
import { HTML_SANDBOX } from "@/lib/htmlShell";
import { HTML_MIME_TYPE } from "@/lib/attachments";
import { addStepAttachment, addStepLinkAttachment, removeAttachment } from "./actions";
import { AttachmentGrid, type AttachmentGridItem } from "./AttachmentGrid";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.html";

// Contador informativo "X/Y casillas": si el HTML subido incluye un script que cuenta sus
// `<input type="checkbox">` y avisa con window.top.postMessage, se muestra acá al lado de su nombre.
// Ejemplo mínimo a pegar en el instructivo:
//
//   <script>
//   (function () {
//     var id = new URLSearchParams(location.search).get("pmskId");
//     function report() {
//       var boxes = document.querySelectorAll('input[type="checkbox"]');
//       var done = 0;
//       boxes.forEach(function (b) { if (b.checked) done++; });
//       window.top.postMessage({ pmskStep: true, id: id, done: done, total: boxes.length }, "*");
//     }
//     document.querySelectorAll('input[type="checkbox"]').forEach(function (b) { b.addEventListener("change", report); });
//     report();
//   })();
//   </script>
//
// Puramente informativo — no bloquea ni marca el paso solo (se probó y se sacó: el paso lo marca
// siempre la persona a mano). Un HTML sin este script simplemente no muestra el contador.
type StepHtmlProgress = { done: number; total: number };

/** Un HTML subido al paso queda incrustado y siempre visible (no hace falta clic), como pidió el usuario. */
function HtmlEmbed({ file, canDelete, onDeleted }: { file: AttachmentGridItem; canDelete: boolean; onDeleted: () => void }) {
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [reported, setReported] = useState<StepHtmlProgress | null>(null);
  // "Pantalla completa" abre el visor grande de la app (mismo de imágenes/documentos), no una pestaña
  // nueva del navegador — así no se pierde el acceso a las demás pestañas abiertas.
  const [showFull, setShowFull] = useState(false);
  const src = `${file.url}${file.url.includes("?") ? "&" : "?"}pmskId=${encodeURIComponent(file.id)}`;

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || data.pmskStep !== true || data.id !== file.id) return;
      setReported({ done: Number(data.done) || 0, total: Number(data.total) || 0 });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [file.id]);

  async function handleDelete() {
    const ok = await confirm(`¿Eliminar "${file.name}"? No vas a poder deshacer esto.`, { confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    setDeleting(true);
    try {
      await removeAttachment(file.id);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      {/* Misma barra (altura, iconos) que el visor grande (AttachmentPreviewModal) al que "Pantalla completa" lleva. */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1">
        <span className="min-w-0 truncate text-xs font-medium text-slate-600">{file.name}</span>
        <div className="flex flex-shrink-0 items-center gap-2">
          {reported && reported.total > 0 && (
            <span className={`text-xs ${reported.done === reported.total ? "font-medium text-emerald-600" : "text-slate-400"}`}>
              {reported.done}/{reported.total} casillas
            </span>
          )}
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<ExpandIcon className="h-4 w-4" />} label="Pantalla completa" onClick={() => setShowFull(true)} />
            {canDelete && <ToolbarButton icon={<TrashIcon className="h-4 w-4" />} label="Eliminar" onClick={handleDelete} disabled={deleting} danger />}
          </div>
        </div>
      </div>
      {/* 45vh: deja asomar bien el siguiente paso, para que no parezca que la lista termina acá. */}
      <iframe src={src} title={file.name} sandbox={HTML_SANDBOX} className="h-[45vh] w-full border-0 bg-white" />
      {showFull && (
        <AttachmentPreviewModal
          file={file}
          onClose={() => setShowFull(false)}
          onDelete={canDelete ? async () => { await removeAttachment(file.id); onDeleted(); } : undefined}
        />
      )}
    </div>
  );
}

/**
 * Archivos, imágenes y links de un paso del checklist: las imágenes se ven ahí mismo (clic para ampliar),
 * un HTML subido queda incrustado y siempre visible (HtmlEmbed, sin necesitar clic), los links son
 * clicables y todo queda también como INSUMO de la tarea (ver addStepAttachment).
 */
export function StepAttachments({
  stepId,
  attachments,
  canEdit,
  canAdd,
}: {
  stepId: string;
  attachments: AttachmentGridItem[];
  canEdit: boolean;
  canAdd: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // Ctrl+V con una captura: va al paso sobre el que está el mouse o el foco (data-paste-zone en
  // StepCheckbox — cubre el paso entero, no solo este bloque de archivos).
  usePasteImage(inputRef);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function uploadFiles(files: File[]) {
    setUploading(true);
    setError(null);
    setProgress(0);
    const failed: string[] = [];
    for (const [i, file] of files.entries()) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const { ok, body } = await uploadWithProgress("/api/upload", formData, (f) => setProgress((i + f) / files.length));
        if (!ok) {
          failed.push(`${file.name}: ${body.error ?? "no se pudo subir"}`);
          continue;
        }
        await addStepAttachment(stepId, body);
      } catch (err) {
        failed.push(`${file.name}: ${(err as Error).message || "no se pudo subir"}`);
      }
    }
    if (failed.length > 0) setError(failed.join(" · "));
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function saveLink() {
    setUploading(true);
    setError(null);
    try {
      await addStepLinkAttachment(stepId, linkUrl.trim(), linkName.trim());
      setLinkUrl("");
      setLinkName("");
      setAddingLink(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Link inválido");
    } finally {
      setUploading(false);
    }
  }

  if (attachments.length === 0 && !canAdd) return null;
  const btn = "cursor-pointer rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700";
  const htmlFiles = attachments.filter((a) => a.mimeType === HTML_MIME_TYPE);
  const rest = attachments.filter((a) => a.mimeType !== HTML_MIME_TYPE);

  return (
    <div className="space-y-1.5 pl-6">
      {htmlFiles.map((f) => (
        <HtmlEmbed key={f.id} file={f} canDelete={canEdit} onDeleted={router.refresh} />
      ))}
      {rest.length > 0 && <AttachmentGrid items={rest} canDelete={canEdit} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" />}
      {canAdd &&
        (addingLink ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="url"
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && linkUrl.trim() && saveLink()}
              placeholder="https://…"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
            <input
              type="text"
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && linkUrl.trim() && saveLink()}
              placeholder="Nombre (opcional)"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
            />
            <button type="button" disabled={uploading || !linkUrl.trim()} onClick={saveLink} className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              Guardar
            </button>
            <button type="button" onClick={() => { setAddingLink(false); setError(null); }} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-400">
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <label className={btn} title="Subir un archivo, o pegar una captura con Ctrl+V">
              {uploading ? `Subiendo… ${Math.round(progress * 100)} %` : "+ Archivo"}
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={() => {
                  const files = Array.from(inputRef.current?.files ?? []);
                  if (files.length > 0) uploadFiles(files);
                }}
              />
            </label>
            <button type="button" onClick={() => setAddingLink(true)} className={btn}>
              + Link
            </button>
          </div>
        ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
