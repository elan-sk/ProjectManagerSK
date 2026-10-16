"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "@/lib/useAppRouter";
import { Avatar } from "@/components/Avatar";
import { LinkFavicon } from "@/components/LinkFavicon";
import { ProjectIcon } from "@/components/ProjectIcon";
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL, TASK_TYPE_BADGE, TASK_TYPE_LABEL, taskStatusFilterOptions } from "@/lib/statusColors";
import { ReviewStateBadge, TaskStatusIcon } from "@/components/TaskIndicators";
import type { SearchHit } from "@/app/api/search/route";
import { HEADER_SEARCH_OPTIONS, OPEN_HEADER_SEARCH_EVENT, isCompactSearch, normalizeSearchText, parseHeaderSearch, splitActiveSegment, splitFilterValue } from "@/lib/search";
import { Hotkey } from "@/components/Hotkey";
import { KeyIcon, SearchIcon, StatusGridIcon, TagIcon, XIcon } from "@/components/icons";
import { useFileViewer } from "@/components/FileViewer";

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
  project: { title: "text-[#136673]" },
  task: { title: "text-task-700" },
  comment: { title: "text-amber-700" },
  file: { title: "text-sky-700" },
};

// La etiqueta por resultado solo aporta cuando distingue algo dentro del grupo
// (paso vs. tarea, archivo vs. link); en los demás sería repetir el título.
const SHOW_KIND_BADGE = new Set<SearchHit["kind"]>(["step", "file", "link", "credential"]);

// Ancho máximo de la tarjeta con la portada de la tarea al pasar el mouse por un resultado.
const COVER_PREVIEW_WIDTH = 240;

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  project: "Proyecto",
  task: "Tarea",
  step: "Paso",
  comment: "Comentario",
  file: "Archivo",
  link: "Link",
  credential: "Contraseña",
};

const KIND_COLOR: Record<SearchHit["kind"] | "taskType" | "taskStatus" | "tag", string> = {
  project: "bg-cyan-50 text-cyan-800",
  task: "bg-task-50 text-task-700",
  step: "bg-slate-100 text-slate-600",
  comment: "bg-amber-50 text-amber-700",
  file: "bg-sky-50 text-sky-700",
  link: "bg-emerald-50 text-emerald-700",
  credential: "bg-red-50 text-red-700", // rojo de seguridad, como sus fichas
  taskType: "bg-teal-50 text-teal-700",
  taskStatus: "bg-blue-50 text-blue-700",
  tag: "bg-indigo-50 text-indigo-700",
};

type TagCategoryChoice = { id: string; name: string; emoji: string | null; colorHex: string };
type Choice = { key: string; label: string; query: string; badge?: string; emoji?: string | null; colorHex?: string };

// Atajos con ícono dentro del campo: cada uno deja escrito su tipo de búsqueda.
const FIELD_SHORTCUTS = [
  { prefix: "estados", label: "Buscar por estado de tarea", Icon: StatusGridIcon },
  { prefix: "etiquetas", label: "Buscar por etiqueta", Icon: TagIcon },
  { prefix: "contraseñas", label: "Buscar contraseñas", Icon: KeyIcon },
];

// Punto de color de cada tipo en el menú «Buscar por tipo» (mismos tonos que las etiquetas).
const KIND_DOT: Record<(typeof HEADER_SEARCH_OPTIONS)[number]["kind"], string> = {
  project: "bg-[#0a6b78]",
  task: "bg-task-500",
  comment: "bg-amber-500",
  file: "bg-sky-500",
  link: "bg-emerald-500",
  credential: "bg-red-500",
  taskType: "bg-teal-500",
  taskStatus: "bg-blue-500",
  tag: "bg-indigo-500",
};

// Fila/sección elegida con el cursor o con las flechas: tinte de marea con un aro
// tenue, no `bg-slate-100` — ese mismo tono es el fondo del chip de categoría de
// etiqueta en las sugerencias y del tipo de tarea «Simple» (TASK_TYPE_BADGE en
// src/lib/statusColors.ts), así que lo seleccionado y la etiqueta se veían del
// mismo color (confusión reportada). Mismo tinte de selección que las sugerencias
// de menciones en CommentForm, para que «elegido» signifique lo mismo en la app.
const SELECTED_CLASS = "bg-[#0a6b78]/15 ring-1 ring-inset ring-[#0a6b78]/30";

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
  // Categorías de etiqueta para sugerir mientras se escribe «etiquetas:…» (llegan con cada búsqueda de ese tipo).
  const [tagCategories, setTagCategories] = useState<TagCategoryChoice[]>([]);
  // Etiquetas de la categoría escrita en «etiquetas:categoría:…», con la categoría a la que corresponden.
  const [tagNames, setTagNames] = useState<{ category: string; names: string[] }>({ category: "", names: [] });
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Con flechas, el resultado elegido siempre queda a la vista dentro del panel (que tiene su propio scroll).
  useEffect(() => {
    rootRef.current?.querySelector(`[data-search-hit="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  // Portada de la tarea bajo el mouse: tarjeta flotante al costado del panel, nunca encima de los resultados.
  // Guarda la lista de resultados donde se pasó el mouse: si la fila desaparece sin «mouseleave» (cambian los resultados o se cierra el panel), se descarta.
  const [cover, setCover] = useState<{ url: string; top: number; left?: number; right?: number; hits: SearchHit[] } | null>(null);
  const [filterActive, setFilterActive] = useState(0);
  const [compact, setCompact] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const historyEntryRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileViewer = useFileViewer();
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
        if (body.categories) setTagCategories(body.categories);
        if (body.tagNames) setTagNames(body.tagNames);
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
    const slot = slotRef.current;
    if (!slot) return;
    const measure = () => setCompact(isCompactSearch(slot.clientWidth, window.innerWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    function onPopState() {
      if (!historyEntryRef.current) return;
      historyEntryRef.current = false;
      setModalOpen(false);
      setFiltersOpen(false);
      setOpen(false);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFiltersOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const input = inputRef.current;
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.code !== "Space") return;
      if (compact && !modalOpen) {
        e.preventDefault();
        showModal();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      if (!input?.offsetParent) return;
      e.preventDefault();
      // Con el foco ya en el campo, el mismo atajo abre (o cierra) «Buscar por tipo».
      if (document.activeElement === input) {
        setFilterActive(0);
        setFiltersOpen((value) => !value);
        return;
      }
      input.focus();
      input.select();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [compact, modalOpen]);

  // Otro componente (ej. un chip de etiqueta en el detalle de la tarea) pide abrir el
  // buscador con una consulta ya escrita: openHeaderSearch() en src/lib/search.ts.
  useEffect(() => {
    function onOpenSearch(e: Event) {
      const q = (e as CustomEvent<string>).detail;
      if (typeof q !== "string") return;
      if (compact && !modalOpen) showModal();
      setQuery(q);
      setFiltersOpen(false);
      setOpen(true);
      setActive(0);
      requestAnimationFrame(() => {
        const input = inputRef.current;
        input?.focus();
        input?.setSelectionRange(q.length, q.length);
      });
    }
    window.addEventListener(OPEN_HEADER_SEARCH_EVENT, onOpenSearch);
    return () => window.removeEventListener(OPEN_HEADER_SEARCH_EVENT, onOpenSearch);
  });

  // Archivos, links y contraseñas se abren en su visor (useFileViewer: mismo criterio que las fichas
  // de archivos); un archivo sin vista previa se descarga y un link común abre en pestaña nueva.
  function showModal() {
    if (!historyEntryRef.current) {
      window.history.pushState(null, "");
      historyEntryRef.current = true;
    }
    setModalOpen(true);
  }

  function closeModal() {
    if (historyEntryRef.current) {
      historyEntryRef.current = false;
      window.history.back();
    }
    setModalOpen(false);
  }

  function openModal(prefix?: string) {
    showModal();
    if (prefix) return selectSearchType(prefix);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function go(hit: SearchHit) {
    setOpen(false);
    setQuery("");
    if (!hit.preview) {
      const replaceEntry = historyEntryRef.current;
      historyEntryRef.current = false;
      setModalOpen(false);
      return replaceEntry ? router.replace(hit.href) : router.push(hit.href);
    }
    closeModal();
    fileViewer.open({ id: hit.id, url: hit.preview.url, name: hit.title, mimeType: hit.preview.mimeType, place: { href: hit.href, title: hit.context ?? hit.title } });
  }

  function selectSearchType(prefix: string) {
    const shortcut = `${prefix}:`;
    setQuery(shortcut);
    setFiltersOpen(false);
    setOpen(true);
    setActive(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(shortcut.length, shortcut.length);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (filtersOpen) {
      const count = HEADER_SEARCH_OPTIONS.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setFilterActive((i) => (i + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
      } else if (e.key === "Enter") {
        e.preventDefault();
        selectSearchType(HEADER_SEARCH_OPTIONS[filterActive].prefix);
      }
      return;
    }
    // Tab completa con la primera sugerencia de tipo o de categoría (la resaltada).
    if (e.key === "Tab" && !e.shiftKey && choices.length > 0) {
      e.preventDefault();
      return choose(choices[0]);
    }
    // Shift+Tab: «o también» (|), así las dos píldoras de unir filtros quedan a mano desde el teclado.
    if (e.key === "Tab" && e.shiftKey && connectorChoices.length > 0) {
      e.preventDefault();
      return choose(connectorChoices[1]);
    }
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

  const showPanel = !filtersOpen && open && trimmed.length >= 2;
  if (cover && (!showPanel || cover.hits !== hits)) setCover(null);
  // Sugerencias para elegir con clic o con Tab (la primera), filtradas por lo que se va escribiendo:
  // - «tipos:…», «estados:…» o «etiquetas:…» antes del segundo «:» → los tipos, los estados o las categorías;
  // - «etiquetas:categoría:…» → las etiquetas de esa categoría.
  // En una combinada («etiquetas:sprint:&proyecto:…») todo esto vale para el último tramo; lo anterior (`head`) queda igual.
  const { head, piece } = splitActiveSegment(trimmed);
  const parsed = parseHeaderSearch(piece);
  const colon = parsed.text.indexOf(":");
  // «etiquetas:categoría: texto» (espacio tras los dos puntos) o «etiquetas:categoría:etiqueta:texto» ya
  // buscan en el contenido de las tareas (ver /api/search): ahí no se sugieren etiquetas.
  const tagRest = colon < 0 ? "" : parsed.text.slice(colon + 1);
  const searchingContent = /^\s/.test(tagRest) || tagRest.includes(":");
  const level = parsed.filter !== "taskType" && parsed.filter !== "taskStatus" && parsed.filter !== "tag" ? 0 : colon < 0 ? 1 : parsed.filter === "tag" && !searchingContent ? 2 : 0;
  const prefix = parsed.filter === "tag" ? "etiquetas" : parsed.filter === "taskStatus" ? "estados" : "tipos";
  const categoryPart = parsed.text.slice(0, Math.max(colon, 0)).trim();
  const partial = normalizeSearchText(level === 2 ? parsed.text.slice(colon + 1).trim() : parsed.text);
  const startsWithPartial = (c: Choice) => (normalizeSearchText(c.label).startsWith(partial) ? 0 : 1);
  // Queda todo pegado, sin espacios y en minúsculas, y siempre termina en «:» para seguir escribiendo
  // lo que se busca dentro (tipos:prueba:, etiquetas:componentes:, etiquetas:componentes:banner:).
  const firstLevel = (label: string) => `${prefix}:${label.toLowerCase()}:`;
  // Categoría escrita en «etiquetas:categoría:…»: sus etiquetas se sugieren con su mismo color y emoji.
  const typedCategory = level === 2 ? tagCategories.find((c) => normalizeSearchText(c.name) === normalizeSearchText(categoryPart)) : undefined;
  const all: Choice[] =
    level === 0
      ? []
      : level === 2
        ? (tagNames.category === categoryPart ? tagNames.names : []).map((name) => ({ key: name, label: name, emoji: typedCategory?.emoji, colorHex: typedCategory?.colorHex, query: `${prefix}:${categoryPart}:${name.toLowerCase()}:` }))
        : parsed.filter === "taskType"
          ? Object.entries(TASK_TYPE_LABEL).map(([type, label]) => ({ key: type, label, badge: TASK_TYPE_BADGE[type], query: firstLevel(label) }))
          : parsed.filter === "taskStatus"
            ? taskStatusFilterOptions().map(({ id, label, badge }) => ({ key: id, label, badge, query: firstLevel(label) }))
            : tagCategories.map((c) => ({ key: c.id, label: c.name, emoji: c.emoji, colorHex: c.colorHex, query: firstLevel(c.name) }));
  // Una sola palabra sin «:» que es el comienzo de un filtro («es» → «estados:»), o nada todavía tras «&»/«|»: se sugiere el filtro.
  const filterChoices: Choice[] =
    !parsed.filter && !piece.includes(":") && !/\s/.test(piece.trim())
      ? HEADER_SEARCH_OPTIONS.filter((o) => normalizeSearchText(o.prefix).startsWith(partial)).map((o) => ({ key: o.prefix, label: `${o.prefix}:`, badge: KIND_COLOR[o.kind], query: `${o.prefix}:` }))
      : [];
  // Filtro con algo escrito («proyectos:panaca», «estados:en curso:»): se ofrece sumar otro con «y» (&) o «o» (|),
  // como una sugerencia más. En tipos, estados y etiquetas, recién cuando el valor ya se eligió (termina en «:»).
  const connectorChoices: Choice[] =
    parsed.filter && splitFilterValue(parsed.text).value && (level === 0 || piece.endsWith(":"))
      ? [
          { key: "&", label: "y además", query: `${piece}&` },
          { key: "|", label: "o también", query: `${piece}|` },
        ]
      : [];
  const choices = filterChoices.length
    ? filterChoices
    : [
        ...all
          // Una etiqueta ya escrita completa deja de sugerirse.
          .filter((c) => normalizeSearchText(c.label).includes(partial) && !(level === 2 && normalizeSearchText(c.label) === partial))
          .sort((x, y) => startsWithPartial(x) - startsWithPartial(y)),
        ...connectorChoices,
      ];
  function choose(choice: Choice) {
    setQuery(head + choice.query);
    setActive(0);
    inputRef.current?.focus();
  }

  const field = (
      <div
        ref={rootRef}
        // Safari y Firefox en Mac no le dan el foco a un botón al pulsarlo: sin esto el campo perdía el
        // foco y el menú o los resultados se cerraban antes de registrar el clic.
        onMouseDown={(e) => {
          if (e.target !== inputRef.current) e.preventDefault();
        }}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setFocused(false);
            setFiltersOpen(false);
            setOpen(false);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setFiltersOpen(false);
            setOpen(false);
            closeModal();
          }
        }}
        className={`group relative min-w-0 flex-1 ${compact ? "" : "max-w-sm"}`}
      >
        {/* Siempre es botón (lupa sin foco, embudo con foco): el primer clic ya abre «Buscar por tipo»,
            igual que el de contraseñas, sin tener que enfocar antes el campo. */}
        <button
          type="button"
          title="Tipos de búsqueda"
          aria-label="Tipos de búsqueda"
          aria-expanded={filtersOpen}
          aria-controls="header-search-types"
          onClick={() => {
            setFilterActive(0);
            setFiltersOpen((value) => !value);
            inputRef.current?.focus();
          }}
          className={`absolute top-1/2 left-1 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white ${focused ? "text-white/80" : "text-slate-400"}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            {focused ? (
              <path d="M4 5h16l-6 7v6l-4 2v-8Z" />
            ) : (
              <>
                <circle cx="11" cy="11" r="6.5" />
                <path d="M20 20l-4-4" />
              </>
            )}
          </svg>
        </button>
        <input
          ref={inputRef}
          data-no-bold
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFiltersOpen(false);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar proyectos, tareas, comentarios, archivos…"
          aria-label="Buscador rápido"
          autoComplete="off"
          className="w-full rounded-full border border-white/25 bg-white/15 py-1.5 pr-23 pl-8 text-sm text-white outline-none [&::-webkit-search-cancel-button]:hidden placeholder:text-white/70 focus:border-white/50 focus:bg-white/25"
        />
        {!query && <Hotkey keys="Espacio" className="absolute top-1/2 right-24 z-10 -translate-y-1/2" />}
        <div className="absolute top-1/2 right-1 flex -translate-y-1/2">
          {FIELD_SHORTCUTS.map(({ prefix, label, Icon }) => (
            <button
              key={prefix}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => selectSearchType(prefix)}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        {filtersOpen && (
          <div id="header-search-types" className="pacific-popover absolute top-full right-0 left-0 z-50 mt-1 rounded-2xl bg-white p-1.5 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]">
            <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Buscar por tipo</p>
            {HEADER_SEARCH_OPTIONS.map(({ prefix, kind, label }, i) => (
              <button key={prefix} type="button" onClick={() => selectSearchType(prefix)} onMouseEnter={() => setFilterActive(i)} className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-900 focus-visible:bg-[#0a6b78]/15 focus-visible:outline-none ${i === filterActive ? SELECTED_CLASS : ""}`}>
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${KIND_DOT[kind]}`} aria-hidden />
                <span className="flex-1">{label}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${KIND_COLOR[kind]}`}>{prefix}:</span>
              </button>
            ))}
          </div>
        )}
        {showPanel && (
          <div className={`pacific-popover absolute top-full right-0 left-0 z-50 mt-1 max-h-[70vh] ${compact ? "min-w-0" : "min-w-[22rem]"} overflow-x-hidden overflow-y-auto rounded-2xl bg-white p-1.5 shadow-[0_4px_8px_rgba(15,23,42,0.08),0_16px_40px_rgba(15,23,42,0.12)]`}>
            {choices.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-1.5">
                {choices.map((c, i) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => choose(c)}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium hover:brightness-95 ${c.badge ?? (c.colorHex ? "" : "bg-slate-100 text-slate-700")} ${i === 0 && partial ? "ring-2 ring-[#0a6b78]/50" : ""}`}
                    // Mismos colores que el chip de etiqueta (TagChip): fondo tenue y texto del color de la categoría.
                    style={!c.badge && c.colorHex ? { backgroundColor: `${c.colorHex}1f`, color: c.colorHex } : undefined}
                  >
                    {c.emoji ? <span aria-hidden>{c.emoji}</span> : c.colorHex ? <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: c.colorHex }} aria-hidden /> : null}
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            {hits.length === 0 ? (
              // Las píldoras & y | no tapan el «Sin resultados».
              choices.every((c) => connectorChoices.includes(c)) && (
                <p className="px-3 py-2 text-sm text-slate-400">
                  {loading ? "Buscando…" : "Sin resultados."}
                </p>
              )
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
                    data-search-hit={i}
                    onClick={() => go(h)}
                    onMouseEnter={(e) => {
                      setActive(i);
                      const panel = e.currentTarget.closest(".pacific-popover")?.getBoundingClientRect();
                      if (!h.coverUrl || !panel) return setCover(null);
                      const width = COVER_PREVIEW_WIDTH + 8;
                      const top = e.currentTarget.getBoundingClientRect().top;
                      // A la izquierda se ancla por su borde derecho: queda pegada al panel aunque la imagen sea angosta.
                      if (panel.left >= width) setCover({ url: h.coverUrl, top, right: window.innerWidth - panel.left + 8, hits });
                      else if (window.innerWidth - panel.right >= width) setCover({ url: h.coverUrl, top, left: panel.right + 8, hits });
                      else setCover(null);
                    }}
                    onMouseLeave={() => setCover(null)}
                    className={`flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg px-2.5 text-left ${h.kind === "project" ? "py-2.5" : "py-1.5"} ${i === active ? SELECTED_CLASS : ""}`}
                  >
                    <span className="flex w-full min-w-0 items-center gap-2.5">
                      {h.project && (
                        <ProjectIcon
                          name={h.project.name}
                          iconUrl={h.project.iconUrl}
                          parent={h.project.parent}
                          size={h.kind === "project" ? "h-10 w-10 text-base" : "h-7 w-7 text-xs"}
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-slate-900 ${h.kind === "project" ? "text-base font-semibold" : "text-sm"}`}>
                          {(h.kind === "link" || h.kind === "credential") && (
                            <LinkFavicon url={(h.kind === "credential" ? h.siteUrl : h.preview?.url) ?? ""} className="mr-1.5 inline-block h-3.5 w-3.5 align-middle" />
                          )}
                          {h.title}
                        </span>
                        {h.context && (
                          <span className="block truncate text-xs text-slate-400">
                            {h.context}
                          </span>
                        )}
                      </span>
                      {(h.people || SHOW_KIND_BADGE.has(h.kind) || (h.kind === "task" && h.taskStatus)) && (
                        <span className="flex flex-shrink-0 flex-col items-end gap-1">
                          {SHOW_KIND_BADGE.has(h.kind) && (
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${KIND_COLOR[h.kind]}`}>{KIND_LABEL[h.kind]}</span>
                          )}
                          {h.kind === "task" && h.taskStatus && (
                            <span className="flex gap-1">
                              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${TASK_TYPE_BADGE[h.taskType ?? ""] ?? TASK_TYPE_BADGE.SIMPLE}`}>
                                {TASK_TYPE_LABEL[h.taskType ?? ""] ?? h.taskType}
                              </span>
                              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${TASK_STATUS_COLOR[h.taskStatus].badge}`}>
                                <TaskStatusIcon status={h.taskStatus} className="mr-0.5 h-3 w-3" />
                                {TASK_STATUS_LABEL[h.taskStatus]}
                              </span>
                              {h.taskReviewState && <ReviewStateBadge state={h.taskReviewState} className="text-[10px]" />}
                            </span>
                          )}
                          {h.people && (
                            <span className="flex items-center gap-1">
                              {h.kind === "project" && <span className="text-[10px] font-semibold text-[#0a6b78]">PM</span>}
                              <span className="flex -space-x-1.5">
                                {h.people.slice(0, 4).map((u) => (
                                  <Avatar key={u.name} name={u.name} avatarUrl={u.avatarUrl} size={h.kind === "project" ? "h-7 w-7 text-[10px]" : "h-5 w-5 text-[9px]"} />
                                ))}
                              </span>
                            </span>
                          )}
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
  );

  const headerButton = "flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100";

  return (
    <div className="flex min-w-0 flex-1 justify-end lg:order-2 lg:justify-start lg:px-5">
      <div ref={slotRef} className="flex min-w-0 flex-1 items-center justify-end lg:justify-start">
        {!compact && <div className="hidden min-w-0 flex-1 lg:flex">{field}</div>}
        <div className={`flex flex-shrink-0 items-center gap-1 ${compact ? "" : "lg:hidden"}`}>
          <button type="button" title="Buscar" aria-label="Buscar" onClick={() => openModal()} className={headerButton}>
            <SearchIcon className="h-5 w-5" />
          </button>
          <button type="button" title="Buscar contraseñas" aria-label="Buscar contraseñas" onClick={() => openModal("contraseñas")} className={headerButton}>
            <KeyIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
      {compact && modalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center overflow-x-hidden overflow-y-auto bg-slate-900/40 px-3 pt-3"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            <div role="dialog" aria-label="Buscador rápido" className="flex w-full max-w-xl items-center gap-1 rounded-2xl bg-[#0a5866] p-2 shadow-[0_16px_40px_rgba(15,23,42,0.3)]">
              {field}
              <button type="button" title="Cerrar buscador" aria-label="Cerrar buscador" onClick={closeModal} className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          </div>,
          document.body
        )}
      {showPanel && cover &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-50 overflow-hidden rounded-2xl border-2 border-task-300 bg-white shadow-[0_10px_20px_rgba(15,23,42,0.18),0_28px_60px_rgba(15,23,42,0.28)]"
            style={{ top: cover.top, left: cover.left, right: cover.right }}
          >
            {/* Proporción exacta de la imagen (sin recorte): la tarjeta se ajusta a ella, hasta 240px de ancho y 80vh de alto.
                Al cargar, si se sale por abajo, sube lo necesario. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover.url}
              alt=""
              className="block h-auto max-h-[80vh] w-auto"
              style={{ maxWidth: COVER_PREVIEW_WIDTH }}
              onLoad={(e) => {
                const height = e.currentTarget.getBoundingClientRect().height + 4;
                const maxTop = window.innerHeight - height - 8;
                setCover((c) => (c && c.url === cover.url && c.top > maxTop ? { ...c, top: Math.max(8, maxTop) } : c));
              }}
            />
          </div>,
          document.body
        )}
      {fileViewer.viewer}
    </div>
  );
}
