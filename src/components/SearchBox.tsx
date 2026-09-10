"use client";

import { useRouter } from "next/navigation";

/**
 * Buscador de texto (título + descripción + nombre de adjuntos) estilo
 * buscador de correo. Form GET nativo para Enter (sin JS); "use client" +
 * onChange solo hace falta para el caso de vaciar el campo (con la "X"
 * nativa del input, o borrando todo a mano) — eso NO manda el form, así que
 * sin esto el filtro quedaba visualmente vacío pero seguía aplicado hasta
 * volver a tocar Enter.
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

  return (
    <form action={basePath} method="get" className="flex items-center gap-1.5">
      {Object.entries(hiddenParams).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input
        type="search"
        name={paramName}
        defaultValue={q ?? ""}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          if (e.target.value) return;
          const p = new URLSearchParams();
          for (const [k, v] of Object.entries(hiddenParams)) if (v) p.set(k, v);
          const qs = p.toString();
          router.push(`${basePath}${qs ? `?${qs}` : ""}`);
        }}
        className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-400"
      />
    </form>
  );
}
