"use client";

import { useRouter } from "next/navigation";
import { SHOW_HIDDEN_PROJECTS_COOKIE } from "@/lib/viewCookie";

/** Botón «Incluir proyectos ocultos» de las vistas generales; el estado queda guardado (ver hiddenProjectsPref). */
export function ShowHiddenProjectsToggle({ active }: { active: boolean }) {
  const router = useRouter();
  function toggle() {
    document.cookie = `${SHOW_HIDDEN_PROJECTS_COOKIE}=${active ? "0" : "1"}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-sm ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
    >
      {active ? "✓ " : ""}Incluir proyectos ocultos
    </button>
  );
}
