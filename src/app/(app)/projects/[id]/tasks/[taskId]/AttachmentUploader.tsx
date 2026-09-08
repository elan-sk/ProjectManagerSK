"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addAttachmentRecord } from "./actions";
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
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer items-center justify-center rounded-lg border border-dashed p-3 text-xs text-slate-500 ${
          dragOver ? "border-slate-500 bg-slate-50" : "border-slate-300 hover:border-slate-400"
        }`}
      >
        {uploading ? "Subiendo…" : dragOver ? "Soltá el archivo acá" : `${label} (o arrastralo acá)`}
        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleChange} />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
