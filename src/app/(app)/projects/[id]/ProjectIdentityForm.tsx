"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProjectIdentity } from "./definitionActions";
import { useModalClose } from "@/components/Modal";
import { ProjectIcon, LIGHT_PROJECT_COLORS, defaultProjectBgColor } from "@/components/ProjectIcon";

export function ProjectIdentityForm({
  projectId,
  name,
  color,
  iconUrl,
}: {
  projectId: string;
  name: string;
  color: string | null;
  iconUrl: string | null;
}) {
  const router = useRouter();
  const onDone = useModalClose();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pickedColor, setPickedColor] = useState(color ?? defaultProjectBgColor(name));
  const [pickedIconUrl, setPickedIconUrl] = useState(iconUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleIconChange() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
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
      if (fileInputRef.current) fileInputRef.current.value = "";
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
        <ProjectIcon name={name} iconUrl={pickedIconUrl} size="h-14 w-14 text-lg" />
        <div className="space-y-1">
          <label className="cursor-pointer text-sm font-medium text-slate-700 hover:underline">
            {uploading ? "Subiendo…" : "Cambiar ícono"}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleIconChange} />
          </label>
          {pickedIconUrl && (
            <button type="button" onClick={() => setPickedIconUrl(null)} className="block text-xs text-slate-400 hover:text-red-600">
              Quitar ícono (usar color + inicial)
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-slate-600">Color</label>
        <input type="hidden" name="color" value={pickedColor} />
        <div className="flex flex-wrap gap-2">
          {LIGHT_PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setPickedColor(c)}
              aria-label={`Elegir color ${c}`}
              style={{ backgroundColor: c }}
              className={`h-8 w-8 rounded-full border-2 ${
                pickedColor === c ? "border-slate-900" : "border-transparent"
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-slate-400">Se usa de fondo en el resumen de proyectos y en la vista del proyecto, para identificarlo de un vistazo.</p>
      </div>

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
