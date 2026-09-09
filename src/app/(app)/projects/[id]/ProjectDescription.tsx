"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProjectDescription } from "./definitionActions";
import { RichTextEditor } from "@/components/RichTextEditor";

export function ProjectDescription({ projectId, description }: { projectId: string; description: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    if (!description) {
      return (
        <button type="button" onClick={() => setEditing(true)} className="text-sm text-slate-400 hover:text-slate-600 hover:underline">
          + Agregar descripción del proyecto
        </button>
      );
    }
    return (
      <div
        role="button"
        tabIndex={0}
        title="Click para editar"
        onClick={() => setEditing(true)}
        className="prose prose-sm -mx-1 max-w-none cursor-text rounded px-1 text-slate-600 hover:bg-slate-100 [&_img]:max-w-full [&_img]:rounded-lg"
        dangerouslySetInnerHTML={{ __html: description }}
      />
    );
  }

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await updateProjectDescription(projectId, formData);
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
