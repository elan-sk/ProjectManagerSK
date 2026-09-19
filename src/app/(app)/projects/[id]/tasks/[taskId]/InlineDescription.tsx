"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTaskDescription } from "./actions";
import { RichTextEditor } from "@/components/RichTextEditor";

export function InlineDescription({
  taskId,
  description,
  canManage,
}: {
  taskId: string;
  description: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    if (!description) {
      if (!canManage) return null;
      return (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-slate-400 hover:text-slate-600 hover:underline"
        >
          + Agregar descripción
        </button>
      );
    }
    return (
      <div
        role={canManage ? "button" : undefined}
        tabIndex={canManage ? 0 : undefined}
        title={canManage ? "Click para editar" : undefined}
        onClick={() => canManage && setEditing(true)}
        className={`prose prose-sm max-w-none text-slate-600 [&_img]:max-w-full [&_img]:rounded-lg ${
          canManage ? "-mx-1 cursor-text rounded px-1 hover:bg-slate-100" : ""
        }`}
        dangerouslySetInnerHTML={{ __html: description }}
      />
    );
  }

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await updateTaskDescription(taskId, formData);
          if (result.ok) {
            setEditing(false);
            router.refresh();
          } else {
            setError(result.error ?? "No se pudo guardar.");
          }
        });
      }}
      className="space-y-2"
    >
      <RichTextEditor name="description" defaultValue={description} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={isPending}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setEditing(false)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
