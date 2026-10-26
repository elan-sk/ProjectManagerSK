"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { login } from "./actions";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(login, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // Normalmente el navegador puede autocompletar usuario y clave. Pero al llegar aquí DESPUÉS de cerrar
  // sesión (?logout=1) el formulario debe quedar en blanco por seguridad: sin autocompletar y limpio,
  // también al volver con «Atrás» (el navegador restaura lo escrito) y si el autocompletado llega tarde.
  const [afterLogout, setAfterLogout] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("logout")) return;
    setAfterLogout(true);
    const clear = () => formRef.current?.reset();
    clear();
    const timers = [150, 600, 1500].map((ms) => setTimeout(clear, ms));
    window.addEventListener("pageshow", clear);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("pageshow", clear);
    };
  }, []);

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
        ref={formRef}
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
            autoComplete={afterLogout ? "off" : "username"}
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
          <span className="relative block">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={afterLogout ? "new-password" : "current-password"}
              required
              className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3 py-2 pr-10 text-sm outline-none focus:border-blue-600 focus:bg-white"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700"
            >
              {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </span>
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
