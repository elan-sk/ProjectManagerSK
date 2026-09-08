"use client";

import { useState, useTransition } from "react";
import { changeOwnPassword } from "./actions";

export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        setSuccess(false);
        startTransition(async () => {
          const result = await changeOwnPassword(formData);
          if (result.ok) setSuccess(true);
          else setError(result.error ?? "No se pudo cambiar la contraseña.");
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Contraseña actual</label>
        <input
          type="password"
          name="currentPassword"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Contraseña nueva</label>
        <input
          type="password"
          name="newPassword"
          required
          minLength={6}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Contraseña actualizada.</p>}
      <button
        disabled={isPending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
