"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addProjectRepo, removeProjectRepo } from "./taskOps";
import { TrashIcon } from "@/components/icons";

// Lista de repositorios vinculados al proyecto: se pueden agregar varios y
// quitar cualquiera.
export function EditReposForm({ projectId, urls }: { projectId: string; urls: string[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        onOk?.();
        router.refresh();
      } else setError(result.error ?? "No se pudo completar la acción.");
    });
  }

  return (
    <div className="space-y-3">
      {urls.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay repositorios vinculados.</p>
      ) : (
        <ul className="space-y-1.5">
          {urls.map((u, i) => (
            <li key={u} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
              <a href={u} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-slate-700 hover:underline">
                {u}
              </a>
              {i === 0 && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">Principal</span>}
              <button type="button" disabled={pending} onClick={() => run(() => removeProjectRepo(projectId, u))} aria-label="Quitar repositorio" className="cursor-pointer text-slate-400 hover:text-red-600 disabled:opacity-50">
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) run(() => addProjectRepo(projectId, url), () => setUrl(""));
        }}
        className="flex gap-2"
      >
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/…" aria-label="URL del repositorio" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button disabled={pending || !url.trim()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
          Agregar
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
