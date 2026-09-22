"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadWithProgress } from "@/lib/uploadWithProgress";
import { usePasteImage } from "@/lib/usePasteImage";
import { addStepAttachment, addStepLinkAttachment } from "./actions";
import { AttachmentGrid, type AttachmentGridItem } from "./AttachmentGrid";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.html";

/**
 * Archivos, imágenes y links de un paso del checklist: las imágenes se ven ahí mismo (clic para ampliar),
 * los links son clicables y todo queda también como INSUMO de la tarea (ver addStepAttachment).
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
  // Ctrl+V con una captura: va al paso sobre el que está el mouse o el foco (data-paste-zone).
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

  return (
    <div data-paste-zone className="space-y-1.5 pl-6">
      {attachments.length > 0 && <AttachmentGrid items={attachments} canDelete={canEdit} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" />}
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
