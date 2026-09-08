"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUserProfile, updateUserAvatar } from "./actions";
import { useModalClose } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";

export function EditUserForm({
  userId,
  name,
  email,
  avatarUrl,
}: {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const onDone = useModalClose();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
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
      await updateUserAvatar(userId, body.url);
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
          startTransition(async () => {
            const result = await updateUserProfile(userId, formData);
            if (result.ok) {
              router.refresh();
              onDone();
            } else {
              setError(result.error ?? "No se pudo guardar.");
            }
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={isPending}
          className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </div>
  );
}
