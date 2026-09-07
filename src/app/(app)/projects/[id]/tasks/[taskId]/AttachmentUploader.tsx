"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addAttachmentRecord } from "./actions";
import type { AttachmentKind } from "@prisma/client";

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
  const [error, setError] = useState<string | null>(null);

  async function handleChange() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

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

  return (
    <div>
      <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500 hover:border-slate-400">
        {uploading ? "Subiendo…" : label}
        <input ref={inputRef} type="file" className="hidden" onChange={handleChange} />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
