"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { getPasswordResetHint, requestPasswordReset } from "../forgotActions";

export default function RecuperarPage() {
  const [step, setStep] = useState<"identifier" | "phone" | "done">("identifier");
  const [identifier, setIdentifier] = useState("");
  const [hint, setHint] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleIdentifierSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await getPasswordResetHint(identifier);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setHint(result.hint);
    setStep("phone");
  }

  async function handlePhoneSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    // Respuesta siempre genérica (ver requestPasswordReset) — no confirma ni
    // descarta si el número escrito era el correcto.
    await requestPasswordReset(identifier, phone);
    setPending(false);
    setStep("done");
  }

  return (
    <main className="pacific-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="relative w-full max-w-sm space-y-4 rounded-2xl border border-slate-200/80 bg-white p-8 shadow-[0_12px_32px_rgba(7,59,76,0.13)]">
        <div className="flex items-center gap-3">
          <span className="pacific-brand-mark" aria-hidden>
            <span className="relative z-10 text-xs font-bold">PM</span>
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.025em] text-slate-900">Recuperar contraseña</h1>
            <p className="text-xs text-slate-500">ProjectManagerSK</p>
          </div>
        </div>

        {step === "identifier" && (
          <form onSubmit={handleIdentifierSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="identifier" className="text-sm font-medium text-slate-700">
                Correo o usuario
              </label>
              <input
                id="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
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
              {pending ? "Buscando…" : "Continuar"}
            </button>
          </form>
        )}

        {step === "phone" && (
          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <p className="text-sm text-slate-600">
              Para confirmar que sos vos, escribí tu número de WhatsApp completo — termina en <strong>**{hint}</strong>.
            </p>
            <div className="space-y-1">
              <label htmlFor="phone" className="text-sm font-medium text-slate-700">
                Número de WhatsApp
              </label>
              <input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. 3164018901"
                inputMode="tel"
                required
                className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-[0_5px_14px_rgba(7,59,76,0.2)] hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "Enviando…" : "Mandar link por WhatsApp"}
            </button>
          </form>
        )}

        {step === "done" && (
          <p className="text-sm text-slate-600">
            Si los datos coinciden con una cuenta, en un momento te llega un mensaje de WhatsApp con el link para elegir una contraseña nueva.
          </p>
        )}

        <Link href="/login" className="block text-center text-sm text-slate-500 hover:underline">
          ← Volver a iniciar sesión
        </Link>
      </div>
    </main>
  );
}
