"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/lib/useAppRouter";
import { ProjectIcon } from "@/components/ProjectIcon";
import { ImageCropModal } from "@/components/ImageCropModal";
import { uploadWithProgress } from "@/lib/uploadWithProgress";
import { saveClientAction } from "./actions";

type Values = { name: string; logoUrl: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null; website: string | null; profile: string | null };

const FIELDS: { key: "contactName" | "contactEmail" | "contactPhone" | "website"; label: string; type: string }[] = [
  { key: "contactName", label: "Persona de contacto", type: "text" },
  { key: "contactEmail", label: "Correo", type: "email" },
  { key: "contactPhone", label: "Teléfono", type: "tel" },
  { key: "website", label: "Sitio web o redes", type: "text" },
];

const INPUT = "w-full rounded-xl border border-slate-200 px-3 py-2 text-[15px]";

export function ClientForm({ id, initial, onCancel }: { id: string | null; initial?: Values; onCancel?: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? null);
  const [name, setName] = useState(initial?.name ?? "");
  const [toCrop, setToCrop] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function uploadLogo(file: File) {
    setToCrop(null);
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { ok, body } = await uploadWithProgress("/api/upload", formData);
      if (!ok) return setError(body.error ?? "No se pudo subir la imagen.");
      if (!body.mimeType?.startsWith("image/")) return setError("El logo tiene que ser una imagen.");
      setLogoUrl(body.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      action={(fd: FormData) => {
        setError(null);
        const text = (k: string) => String(fd.get(k) ?? "");
        startTransition(async () => {
          const result = await saveClientAction(id, {
            name,
            logoUrl,
            contactName: text("contactName"),
            contactEmail: text("contactEmail"),
            contactPhone: text("contactPhone"),
            website: text("website"),
            profile: text("profile"),
          });
          if (!result.ok) return setError(result.error);
          if (id) {
            onCancel?.();
            router.refresh();
          } else router.push(`/clients/${result.id}`);
        });
      }}
      className="space-y-4"
    >
      <div className="flex items-center gap-4">
        <ProjectIcon name={name || "C"} iconUrl={logoUrl} size="h-14 w-14 text-lg" />
        <div className="space-y-1">
          <label className="cursor-pointer text-sm font-medium text-slate-700 hover:underline">
            {uploading ? "Subiendo…" : logoUrl ? "Cambiar logo" : "Subir logo"}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={() => {
                const file = fileRef.current?.files?.[0];
                if (file) setToCrop(file);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
          </label>
          {logoUrl && (
            <button type="button" onClick={() => setLogoUrl(null)} className="block text-xs text-slate-400 hover:text-red-600">
              Quitar logo
            </button>
          )}
          {toCrop && <ImageCropModal file={toCrop} title="Recortar logo" round={false} onCancel={() => setToCrop(null)} onConfirm={uploadLogo} />}
        </div>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required className={INPUT} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">
              {f.label} <span className="font-normal text-slate-400">(opcional)</span>
            </span>
            <input name={f.key} type={f.type} defaultValue={initial?.[f.key] ?? ""} className={INPUT} />
          </label>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Perfil</span>
        <textarea name="profile" rows={6} defaultValue={initial?.profile ?? ""} className={`${INPUT} leading-relaxed`} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={isPending} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={isPending || uploading} className="rounded-full bg-[#073b4c] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0a6b78] disabled:opacity-60">
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
