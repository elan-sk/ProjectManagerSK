"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetPasswordWithToken } from "../../forgotActions";

export function NewPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    const result = await resetPasswordWithToken(token, formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1500);
  }

  if (done) {
    return <p className="text-sm text-emerald-600">Contraseña actualizada — redirigiendo al login…</p>;
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">
          Nueva contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:bg-white"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-[0_5px_14px_rgba(7,59,76,0.2)] hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
