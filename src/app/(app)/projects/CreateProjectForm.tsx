"use client";

import { useState, useTransition } from "react";
import { createProject } from "./actions";

// Antes era un <form action={createProject}> directo sin componente cliente
// — si algo fallaba (createProjectSchema.parse tirando), no había forma de
// mostrar el error: la acción es una redirect() en el camino feliz, así que
// nunca se armó un manejo de resultado. Mismo patrón que el resto de los
// formularios de la app (useTransition + error en pantalla).
export function CreateProjectForm({ users }: { users: { id: string; name: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await createProject(formData);
          // Éxito = createProject hace redirect() y esta promesa nunca
          // resuelve normal — solo llegamos acá si falló.
          if (result && !result.ok) setError(result.error ?? "No se pudo crear el proyecto.");
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Nombre</label>
        <input name="name" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Cliente (opcional)</label>
        <input name="clientName" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Inicio</label>
        <input type="date" name="startDate" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Product Manager</label>
        <select name="pmId" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Creando…" : "Crear proyecto"}
      </button>
    </form>
  );
}
