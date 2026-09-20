"use client";

import { usePasteImage } from "@/lib/usePasteImage";
import { UploadZoneLabel } from "@/components/UploadZoneLabel";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addAttachmentRecord, addLinkAttachment } from "./actions";
import { MediaGalleryButton } from "./MediaGalleryButton";
import type { AttachmentKind } from "@prisma/client";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";

export function AttachmentUploader({
  taskId,
  userId,
  kind,
  label,
}: {
  taskId: string;
  userId: string;
  kind: AttachmentKind;
  label: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  usePasteImage(inputRef);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "No se pudo subir el archivo");
        return;
      }

      await addAttachmentRecord(taskId, kind, body, userId);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "No se pudo subir el archivo");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleChange() {
    const file = inputRef.current?.files?.[0];
    if (file) uploadFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  async function saveLink() {
    setUploading(true);
    setError(null);
    try {
      await addLinkAttachment(taskId, kind, linkUrl.trim(), linkName.trim(), userId);
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

  const canSaveLink = linkUrl.trim() !== "" && linkName.trim() !== "";

  if (addingLink) {
    return (
      <div className="flex flex-col gap-2">
        <input
          type="url"
          autoFocus
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canSaveLink && saveLink()}
          placeholder="https://…"
          className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-xs"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSaveLink && saveLink()}
            placeholder="Nombre (lo que se va a ver)"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={uploading || !canSaveLink}
            onClick={saveLink}
            className="flex-shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingLink(false);
              setError(null);
            }}
            className="flex-shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-slate-400"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
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
          <UploadZoneLabel uploading={uploading} dragOver={dragOver} label={label} />
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleChange} />
        </label>
        <button
          type="button"
          onClick={() => setAddingLink(true)}
          className="flex-shrink-0 rounded-lg border border-dashed border-slate-300 px-3 text-xs text-slate-500 hover:border-slate-400"
        >
          + Link
        </button>
        <MediaGalleryButton taskId={taskId} userId={userId} kind={kind} />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
