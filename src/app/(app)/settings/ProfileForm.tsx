"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile, updateAvatar } from "./actions";
import { Avatar } from "@/components/Avatar";

export function ProfileForm({
  name,
  email,
  phone,
  avatarUrl,
}: {
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleAvatarChange() {
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
        setError(body.error ?? "No se pudo subir la imagen");
        return;
      }
      if (!body.mimeType?.startsWith("image/")) {
        setError("El avatar tiene que ser una imagen.");
        return;
      }
      await updateAvatar(body.url);
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} avatarUrl={avatarUrl} size="h-14 w-14 text-lg" />
        <label className="cursor-pointer text-sm font-medium text-slate-700 hover:underline">
          {uploading ? "Subiendo…" : "Cambiar foto"}
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarChange} />
        </label>
      </div>

      <form
        action={(formData: FormData) => {
          setError(null);
          setSuccess(false);
          startTransition(async () => {
            const result = await updateProfile(formData);
            if (result.ok) setSuccess(true);
            else setError(result.error ?? "No se pudo guardar.");
          });
        }}
        className="space-y-3"
      >
        <div className="space-y-1">
          <label className="text-sm text-slate-600">Nombre</label>
          <input name="name" required defaultValue={name} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-600">Email</label>
          <input type="email" name="email" required defaultValue={email} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-600">WhatsApp</label>
          <input
            type="tel"
            name="phone"
            defaultValue={phone ?? ""}
            placeholder="573001234567"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-400">Con indicativo de país, solo números. Para que te puedan mencionar en las alertas del grupo.</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">Perfil actualizado.</p>}
        <button
          disabled={isPending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </div>
  );
}
