"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { ProjectIcon } from "@/components/ProjectIcon";
import type { SearchHit } from "@/app/api/search/route";

// Los resultados llegan ya ordenados por grupo (ver /api/search): Proyectos →
// Tareas → Comentarios → Archivos. Cada grupo lleva su título.
const GROUP_LABEL: Record<SearchHit["group"], string> = {
  project: "Proyectos",
  task: "Tareas",
  comment: "Comentarios",
  file: "Archivos y links",
};

// Un color por grupo (mismos tonos que las etiquetas de abajo) para reconocerlo de un vistazo:
// título del grupo.
const GROUP_COLOR: Record<SearchHit["group"], { title: string }> = {
  project: { title: "text-[#0a6b78]" },
  task: { title: "text-indigo-700" },
  comment: { title: "text-amber-700" },
  file: { title: "text-sky-700" },
};

// La etiqueta por resultado solo aporta cuando distingue algo dentro del grupo
// (paso vs. tarea, archivo vs. link); en los demás sería repetir el título.
const SHOW_KIND_BADGE = new Set<SearchHit["kind"]>(["step", "file", "link"]);

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  project: "Proyecto",
  task: "Tarea",
  step: "Paso",
  comment: "Comentario",
  file: "Archivo",
  link: "Link",
};

const KIND_COLOR: Record<SearchHit["kind"], string> = {
  // Sólido (no tinte): la fila activa del resultado ya es verdosa y un tinte del mismo tono se perdía.
  project: "bg-[#0a6b78] text-white",
  task: "bg-indigo-50 text-indigo-700",
  step: "bg-slate-100 text-slate-600",
  comment: "bg-amber-50 text-amber-700",
  file: "bg-sky-50 text-sky-700",
  link: "bg-violet-50 text-violet-700",
};

/**
 * Buscador rápido del header: resultados en un desplegable bajo el campo,
 * mientras se escribe (sin modal). Tolera tildes, mayúsculas y errores de
 * tipeo — la coincidencia difusa se resuelve en /api/search.
 */
export function HeaderSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // `result.q` = consulta a la que corresponden `result.hits`; mientras no
  // coincida con lo escrito, se está buscando.
  const [result, setResult] = useState<{ q: string; hits: SearchHit[] }>({
    q: "",
    hits: [],
  });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();
  const hits = result.q === trimmed ? result.hits : [];
  const loading = trimmed.length >= 2 && result.q !== trimmed;

  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        const body = res.ok ? await res.json() : { hits: [] };
        setResult({ q: trimmed, hits: body.hits });
        setActive(0);
      } catch {
        // abortado por una tecla nueva — la siguiente búsqueda toma el relevo
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function go(hit: SearchHit) {
    setOpen(false);
    setQuery("");
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown" && hits.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    }
  }

  const showPanel = open && trimmed.length >= 2;

  return (
    <div className="flex grow px-5">
      <div
        ref={rootRef}
        className="relative hidden min-w-0 flex-1 md:block md:max-w-sm"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path strokeLinecap="round" d="M20 20l-4-4" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar proyectos, tareas, comentarios, archivos…"
          aria-label="Buscador rápido"
          autoComplete="off"
          className="w-full rounded-full border border-white/25 bg-white/15 py-1.5 pr-3 pl-8 text-sm text-white outline-none placeholder:text-white/70 focus:border-white/50 focus:bg-white/25"
        />
        {showPanel && (
          <div className="pacific-popover absolute top-full right-0 left-0 z-50 mt-1 max-h-[70vh] min-w-[22rem] overflow-x-hidden overflow-y-auto rounded-2xl bg-white p-1.5 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]">
            {hits.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">
                {loading ? "Buscando…" : "Sin resultados."}
              </p>
            ) : (
              hits.map((h, i) => (
                <Fragment key={`${h.kind}:${h.id}`}>
                  {(i === 0 || hits[i - 1].group !== h.group) && (
                    <p className={`px-2.5 pb-0.5 text-[10px] font-semibold tracking-wide ${GROUP_COLOR[h.group].title} uppercase ${i === 0 ? "pt-1" : "mt-1 border-t border-slate-100 pt-2"}`}>
                      {GROUP_LABEL[h.group]}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => go(h)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left ${i === active ? "bg-slate-100" : ""}`}
                  >
                    {SHOW_KIND_BADGE.has(h.kind) && (
                      <span
                        className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${KIND_COLOR[h.kind]}`}
                      >
                        {KIND_LABEL[h.kind]}
                      </span>
                    )}
                    <span className="flex w-full min-w-0 items-center gap-2.5">
                      {h.project && <ProjectIcon name={h.project.name} iconUrl={h.project.iconUrl} size="h-7 w-7 rounded text-xs" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-900">
                          {h.title}
                        </span>
                        {h.context && (
                          <span className="block truncate text-xs text-slate-400">
                            {h.context}
                          </span>
                        )}
                      </span>
                      {h.people && (
                        <span className="flex flex-shrink-0 -space-x-1.5">
                          {h.people.slice(0, 4).map((u) => (
                            <Avatar key={u.name} name={u.name} avatarUrl={u.avatarUrl} size="h-5 w-5 text-[9px]" />
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                </Fragment>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
