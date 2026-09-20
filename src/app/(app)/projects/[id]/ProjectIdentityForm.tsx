"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProjectIdentity } from "./definitionActions";
import { useModalClose } from "@/components/Modal";
import { ProjectIcon } from "@/components/ProjectIcon";
import { ImageCropModal } from "@/components/ImageCropModal";

export function ProjectIdentityForm({
  projectId,
  name,
  iconUrl,
}: {
  projectId: string;
  name: string;
  iconUrl: string | null;
}) {
  const router = useRouter();
  const onDone = useModalClose();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickedIconUrl, setPickedIconUrl] = useState(iconUrl);
  const [pickedName, setPickedName] = useState(name);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Al elegir la imagen se abre el recorte; recién al confirmarlo se sube.
  const [toCrop, setToCrop] = useState<File | null>(null);
  function handleIconChange() {
    const file = fileInputRef.current?.files?.[0];
    if (file) setToCrop(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadIcon(file: File) {
    setToCrop(null);
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "No se pudo subir la imagen");
        return;
      }
      if (!body.mimeType?.startsWith("image/")) {
        setError("El ícono tiene que ser una imagen.");
        return;
      }
      setPickedIconUrl(body.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await updateProjectIdentity(projectId, formData);
          if (result.ok) {
            onDone();
            router.refresh();
          } else {
            setError(result.error ?? "No se pudo guardar.");
          }
        });
      }}
      className="space-y-4"
    >
      <input type="hidden" name="iconUrl" value={pickedIconUrl ?? ""} />

      <div className="flex items-center gap-3">
        <ProjectIcon name={pickedName || name} iconUrl={pickedIconUrl} size="h-14 w-14 text-lg" />
        <div className="space-y-1">
          <label className="cursor-pointer text-sm font-medium text-slate-700 hover:underline">
            {uploading ? "Subiendo…" : "Cambiar ícono"}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleIconChange} />
          </label>
          {toCrop && <ImageCropModal file={toCrop} title="Recortar ícono" round={false} onCancel={() => setToCrop(null)} onConfirm={uploadIcon} />}
          {pickedIconUrl && (
            <button type="button" onClick={() => setPickedIconUrl(null)} className="block text-xs text-slate-400 hover:text-red-600">
              Quitar ícono (usar color + inicial)
            </button>
          )}
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Nombre del proyecto</span>
        <input
          type="text"
          name="name"
          value={pickedName}
          onChange={(e) => setPickedName(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={isPending}
        className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
