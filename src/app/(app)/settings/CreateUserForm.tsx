"use client";

import { useState, useTransition } from "react";
import { createUser } from "./actions";
import { useModalClose } from "@/components/Modal";

export function CreateUserForm() {
  const onDone = useModalClose();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await createUser(formData);
          if (result.ok) onDone();
          else setError(result.error ?? "No se pudo crear el usuario.");
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Nombre</label>
        <input name="name" required autoFocus className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Email</label>
        <input type="email" name="email" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-sm text-slate-600">Rol</label>
          <select name="role" defaultValue="MEMBER" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="MEMBER">Miembro</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-600">Contraseña inicial</label>
          <input
            type="text"
            name="password"
            required
            minLength={6}
            defaultValue="cambiar-esta-clave"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={isPending}
        className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Creando…" : "Crear usuario"}
      </button>
    </form>
  );
}
