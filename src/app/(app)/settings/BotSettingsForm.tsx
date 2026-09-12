"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateBotProfile,
  updateBotAvatar,
  updateBotApiKey,
  clearBotApiKey,
  updateBotMonthlyLimit,
  updateBotPersonaPrompt,
} from "./botActions";
import { Avatar } from "@/components/Avatar";

export function BotSettingsForm({
  name,
  avatarUrl,
  apiKeyConfigured,
  apiKeyLast4,
  monthlyLimit,
  usedThisPeriod,
  personaPrompt,
  personaIsCustom,
}: {
  name: string;
  avatarUrl: string | null;
  apiKeyConfigured: boolean;
  apiKeyLast4: string | null;
  monthlyLimit: number;
  usedThisPeriod: number;
  personaPrompt: string;
  personaIsCustom: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [changingKey, setChangingKey] = useState(!apiKeyConfigured);

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
      await updateBotAvatar(body.url);
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Avatar name={name} avatarUrl={avatarUrl} size="h-14 w-14 text-lg" />
          <label className="block cursor-pointer text-sm font-medium text-slate-700 hover:underline">
            {uploading ? "Subiendo…" : "Cambiar foto"}
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarChange} />
          </label>
        </div>

        <form
          action={(formData: FormData) => {
            setError(null);
            setSuccess(false);
            startTransition(async () => {
              const newName = (formData.get("name") as string) || "Chontatec";
              await updateBotProfile(newName, avatarUrl);
              setSuccess(true);
              router.refresh();
            });
          }}
          className="space-y-1.5"
        >
          <label className="block text-sm text-slate-600">Nombre del bot</label>
          <div className="flex flex-wrap items-center gap-2">
            <input name="name" required defaultValue={name} className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button
              disabled={isPending}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {isPending ? "Guardando…" : "Guardar"}
            </button>
            {success && <span className="text-xs text-emerald-600">Guardado.</span>}
          </div>
        </form>
      </div>

      <div className="space-y-1.5 border-t border-slate-100 pt-4">
        <label className="block text-sm text-slate-600">Tono / personalidad</label>
        <p className="text-xs text-slate-400">Cómo debe hablar el bot — esto se le manda como instrucción en cada conversación.</p>
        <form
          action={(formData: FormData) => {
            setError(null);
            startTransition(async () => {
              const value = (formData.get("persona") as string) ?? "";
              await updateBotPersonaPrompt(value);
              router.refresh();
            });
          }}
          className="space-y-1.5"
        >
          <textarea
            name="persona"
            defaultValue={personaPrompt}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={isPending}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {isPending ? "Guardando…" : "Guardar tono"}
            </button>
            {personaIsCustom && (
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await updateBotPersonaPrompt("");
                    router.refresh();
                  })
                }
                className="text-xs font-medium text-slate-500 hover:underline"
              >
                Restaurar tono predeterminado
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="space-y-1.5 border-t border-slate-100 pt-4">
        <label className="block text-sm text-slate-600">Clave de API de Anthropic</label>
        {!changingKey && apiKeyConfigured && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-emerald-600">Configurada ✓ (termina en …{apiKeyLast4})</span>
            <button type="button" onClick={() => setChangingKey(true)} className="text-xs font-medium text-slate-500 hover:underline">
              Cambiar clave
            </button>
            <button
              type="button"
              onClick={() => startTransition(async () => { await clearBotApiKey(); router.refresh(); })}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Quitar
            </button>
          </div>
        )}
        {changingKey && (
          <form
            action={(formData: FormData) => {
              setError(null);
              startTransition(async () => {
                const key = (formData.get("apiKey") as string) ?? "";
                const result = await updateBotApiKey(key);
                if (result.ok) {
                  setChangingKey(false);
                  router.refresh();
                } else {
                  setError(result.error ?? "No se pudo guardar la clave.");
                }
              });
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              type="password"
              name="apiKey"
              placeholder="sk-ant-…"
              required
              className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              disabled={isPending}
              className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isPending ? "Guardando…" : "Guardar clave"}
            </button>
          </form>
        )}
        <p className="text-xs text-slate-400">No tiene que ser la misma cuenta que uses para otra cosa — queda guardada en la base de datos.</p>
      </div>

      <div className="space-y-1.5 border-t border-slate-100 pt-4">
        <label className="block text-sm text-slate-600">Tope de preguntas por mes (compartido por todo el equipo)</label>
        <form
          action={(formData: FormData) => {
            setError(null);
            startTransition(async () => {
              const limit = Number(formData.get("limit"));
              const result = await updateBotMonthlyLimit(limit);
              if (!result.ok) setError(result.error ?? "No se pudo guardar.");
              else router.refresh();
            });
          }}
          className="flex items-center gap-2"
        >
          <input
            type="number"
            name="limit"
            min={1}
            defaultValue={monthlyLimit}
            className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            disabled={isPending}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Guardar
          </button>
        </form>
        <p className="text-xs text-slate-400">
          Usadas este mes: {usedThisPeriod} / {monthlyLimit}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
