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

  async function handleChange() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("No se pudo subir el archivo");
      const uploaded = await res.json();

      await addAttachmentRecord(taskId, kind, uploaded, userId);
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500 hover:border-slate-400">
      {uploading ? "Subiendo…" : label}
      <input ref={inputRef} type="file" className="hidden" onChange={handleChange} />
    </label>
  );
}
