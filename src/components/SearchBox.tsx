"use client";

import { useRouter } from "next/navigation";

/**
 * Buscador de texto (título + descripción + nombre de adjuntos) estilo
 * buscador de correo. El submit (Enter) se intercepta para navegar por el
 * router de Next en vez de dejar que el <form> haga un GET nativo — un GET
 * nativo es una recarga real de página (pierde el scroll del tablero sin
 * remedio); con router.push + scroll:false, cambiar la búsqueda se comporta
 * igual que el resto de los filtros (ComboFilter). El onChange por separado
 * solo hace falta para el caso de vaciar el campo (con la "X" nativa del
 * input, o borrando todo a mano) — eso no dispara un submit.
 */
export function SearchBox({
  basePath,
  q,
  paramName = "q",
  placeholder = "Buscar tareas…",
  hiddenParams,
}: {
  basePath: string;
  q?: string;
  /** Nombre del query param — por defecto "q"; distinto cuando conviven dos buscadores en la misma página (ej. proyectos vs. tareas). */
  paramName?: string;
  placeholder?: string;
  hiddenParams: Record<string, string | undefined>;
}) {
  const router = useRouter();

  function buildHref(value: string) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(hiddenParams)) if (v) p.set(k, v);
    if (value) p.set(paramName, value);
    const qs = p.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  return (
    <form
      action={basePath}
      method="get"
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const value = new FormData(e.currentTarget).get(paramName);
        router.push(buildHref(typeof value === "string" ? value : ""), { scroll: false });
      }}
    >
      {Object.entries(hiddenParams).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input
        type="search"
        name={paramName}
        defaultValue={q ?? ""}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          if (e.target.value) return;
          router.push(buildHref(""), { scroll: false });
        }}
        className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
      />
    </form>
  );
}
