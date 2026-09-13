"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "./actions";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(login, undefined);

  return (
    <main className="pacific-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <svg
        aria-hidden
        viewBox="0 0 1440 220"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-[color:var(--pacific-tide)] opacity-[0.12] sm:h-56"
      >
        <path
          fill="currentColor"
          d="M0,120 C240,180 480,40 720,90 C960,140 1200,60 1440,110 L1440,220 L0,220 Z"
        />
      </svg>
      <svg
        aria-hidden
        viewBox="0 0 1440 220"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 w-full text-[color:var(--pacific-deep)] opacity-[0.09] sm:h-44"
      >
        <path
          fill="currentColor"
          d="M0,160 C300,90 660,190 960,130 C1160,90 1320,150 1440,120 L1440,220 L0,220 Z"
        />
      </svg>
      <form
        action={formAction}
        className="relative w-full max-w-sm space-y-4 rounded-2xl border border-slate-200/80 bg-white p-8 shadow-[0_12px_32px_rgba(7,59,76,0.13)]"
      >
        <div className="flex items-center gap-3">
          <span className="pacific-brand-mark" aria-hidden><span className="relative z-10 text-xs font-bold">PM</span></span>
          <div><h1 className="text-xl font-semibold tracking-[-0.025em] text-slate-900">Iniciar sesión</h1><p className="text-xs text-slate-500">ProjectManagerSK</p></div>
        </div>

        <div className="space-y-1">
          <label htmlFor="identifier" className="text-sm font-medium text-slate-700">
            Usuario o correo
          </label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            required
            className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <Link href="/login/recuperar" className="text-xs text-slate-500 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
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
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
