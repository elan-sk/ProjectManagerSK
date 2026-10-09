"use client";

import { UPLOAD_ACCEPT } from "@/lib/uploadLimits";
import { isDuplicate } from "@/lib/duplicateNotice";
import { useDuplicateNotice } from "@/lib/useDuplicateNotice";

import { usePasteImage } from "@/lib/usePasteImage";
import { UploadZoneLabel } from "@/components/UploadZoneLabel";
import { uploadWithProgress } from "@/lib/uploadWithProgress";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addAttachmentRecord, addLinkAttachment } from "./actions";
import { MediaGalleryButton } from "./MediaGalleryButton";
import type { AttachmentKind } from "@prisma/client";
import type { CredentialPlace } from "@/lib/credentialPlace";
import { AddCredentialButton } from "../../../../credentials/AddCredentialButton";

const ACCEPT = UPLOAD_ACCEPT;

export function AttachmentUploader({
  taskId,
  userId,
  kind,
  label,
  credentialPlace,
}: {
  taskId: string;
  userId: string;
  kind: AttachmentKind;
  label: string;
  /** Si se pasa, muestra «+ Contraseña» junto a Galería (Insumos de la tarea). */
  credentialPlace?: CredentialPlace;
}) {
  const router = useRouter();
  const notifyDuplicate = useDuplicateNotice();
  const inputRef = useRef<HTMLInputElement>(null);
  usePasteImage(inputRef);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");

  // Sube uno o varios archivos, de a uno, y refresca al final. Si alguno falla, sigue con el resto y avisa cuál.
  async function uploadFiles(files: File[]) {
    setUploading(true);
    setError(null);
    setProgress(0);
    const failed: string[] = [];
    const dup: string[] = [];
    for (const [i, file] of files.entries()) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const { ok, body } = await uploadWithProgress("/api/upload", formData, (f) => setProgress((i + f) / files.length));
        if (!ok) {
          failed.push(`${file.name}: ${body.error ?? "no se pudo subir"}`);
          continue;
        }
        if (isDuplicate(await addAttachmentRecord(taskId, kind, body, userId))) dup.push(file.name);
      } catch (err) {
        failed.push(`${file.name}: ${(err as Error).message || "no se pudo subir"}`);
      }
    }
    if (failed.length > 0) setError(failed.join(" · "));
    notifyDuplicate(dup);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  function handleChange() {
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length > 0) uploadFiles(files);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) uploadFiles(files);
  }

  async function saveLink() {
    setUploading(true);
    setError(null);
    try {
      if (isDuplicate(await addLinkAttachment(taskId, kind, linkUrl.trim(), linkName.trim(), userId))) notifyDuplicate([linkName.trim() || linkUrl.trim()]);
      setLinkUrl("");
      setLinkName("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Link inválido");
    } finally {
      setUploading(false);
    }
  }

  const canSaveLink = linkUrl.trim() !== "";

  // Fila de arriba: subir, «+ Contraseña» (solo en Insumos) y Galería. Abajo, el link siempre a mano:
  // se pega la dirección, opcionalmente un nombre, y se agrega con Enter o con «Agregar».
  const addOnEnter = (e: React.KeyboardEvent) => e.key === "Enter" && canSaveLink && !uploading && saveLink();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border border-dashed p-3 text-xs text-slate-500 ${
            dragOver ? "border-slate-500 bg-slate-50" : "border-slate-300 hover:border-slate-400"
          }`}
        >
          <UploadZoneLabel uploading={uploading} dragOver={dragOver} label={label} progress={progress} />
          <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={handleChange} />
        </label>
        {credentialPlace && (
          <AddCredentialButton
            place={credentialPlace}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 text-xs text-slate-500 hover:border-slate-400"
          />
        )}
        <MediaGalleryButton taskId={taskId} userId={userId} kind={kind} />
      </div>
      <div className="flex gap-2">
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onKeyDown={addOnEnter}
          placeholder="Pegar link https://…"
          aria-label="Dirección del link"
          className="min-w-0 flex-[2] rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs hover:border-slate-400 focus:border-solid focus:border-slate-500 focus:outline-none"
        />
        <input
          type="text"
          value={linkName}
          onChange={(e) => setLinkName(e.target.value)}
          onKeyDown={addOnEnter}
          placeholder="Nombre (opcional)"
          aria-label="Nombre del link"
          className="min-w-0 flex-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs hover:border-slate-400 focus:border-solid focus:border-slate-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={uploading || !canSaveLink}
          onClick={saveLink}
          className="flex-shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
