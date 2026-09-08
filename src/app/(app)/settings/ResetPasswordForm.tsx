"use client";

import { useState, useTransition } from "react";
import { resetUserPassword } from "./actions";
import { useModalClose } from "@/components/Modal";

export function ResetPasswordForm({ userId }: { userId: string }) {
  const onDone = useModalClose();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await resetUserPassword(userId, formData);
          if (result.ok) onDone();
          else setError(result.error ?? "No se pudo restablecer la contraseña.");
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-1">
        <label className="text-sm text-slate-600">Contraseña nueva</label>
        <input
          type="text"
          name="password"
          required
          minLength={6}
          autoFocus
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={isPending}
        className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Guardando…" : "Restablecer contraseña"}
      </button>
    </form>
  );
}
