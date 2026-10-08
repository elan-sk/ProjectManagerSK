// Qué está haciendo la app, para la barra de estado inferior (NavigationProgress): navegaciones,
// acciones que guardan o procesan, y subidas. Cada quien avisa con beginActivity(); la barra muestra
// la actividad más reciente con su texto. Sin "use client" ni dependencias: se usa desde componentes
// y desde utilidades del navegador (uploadWithProgress).

export const ACTIVITY_EVENT = "pmsk:activity";
export type ActivityDetail = { id: string; label?: string; progress?: number; done?: boolean };

let seq = 0;

function emit(detail: ActivityDetail) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<ActivityDetail>(ACTIVITY_EVENT, { detail }));
}

/** Empieza una actividad visible en la barra. `update` cambia el texto o el avance (0–1); `end` la quita. */
export function beginActivity(label: string, id = `a${++seq}`) {
  emit({ id, label });
  return {
    update: (next: { label?: string; progress?: number }) => emit({ id, ...next }),
    end: () => emit({ id, done: true }),
  };
}

// Acciones del servidor que corren solas (sondeos): no deben encender la barra cada pocos segundos.
let quietDepth = 0;

/** Corre `fn` sin mostrar «Procesando…» (para consultas automáticas, no para lo que hace la persona). */
export async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  quietDepth++;
  try {
    return await fn();
  } finally {
    quietDepth--;
  }
}

export const isQuiet = () => quietDepth > 0;

/** Cierra una actividad por su id (ej. la navegación "nav" al cambiar la URL). */
export function endActivity(id: string) {
  emit({ id, done: true });
}

// Mismos nombres que muestran las pestañas del proyecto.
const VIEW_LABEL: Record<string, string> = {
  kanban: "el tablero",
  gantt: "el Gantt",
  calendar: "el calendario",
  files: "los archivos",
  definition: "la definición",
  conversation: "la conversación",
};

const SECTION_LABEL: [RegExp, string][] = [
  [/^\/agenda\/?$/, "Entrando a la Agenda"],
  [/^\/projects\/?$/, "Entrando a Proyectos"],
  [/^\/performance(\/|$)/, "Entrando a Rendimiento"],
  [/^\/settings(\/|$)/, "Entrando a Configuración"],
  [/^\/collisions(\/|$)/, "Revisando cruces de agenda"],
];

const SEARCH_KEYS = ["q", "fileQ"];
const DATE_KEYS = ["from", "to", "date", "mode"];

/** Nombre corto del link para el texto (solo si es una línea razonable; una tarjeta entera no sirve). */
function shortName(text?: string | null) {
  const t = text?.replace(/\s+/g, " ").trim();
  if (!t || t.length > 60 || /^[←→↗+]/.test(t)) return null;
  return t;
}

/**
 * Texto para una navegación de `current` a `href`. `linkText`: nombre del link pulsado (aria-label,
 * title o su texto). Ej.: «Abriendo la tarea "Diseño UX"», «Mostrando el Gantt», «Buscando "factura"»,
 * «Aplicando filtros».
 */
export function navigationLabel(href: string, current: string, linkText?: string | null): string {
  let next: URL;
  let now: URL;
  try {
    now = new URL(current);
    next = new URL(href, current);
  } catch {
    return "Cargando…";
  }
  const name = shortName(linkText);

  if (next.pathname === now.pathname) {
    const changed = new Set<string>();
    for (const k of new Set([...next.searchParams.keys(), ...now.searchParams.keys()])) {
      if (next.searchParams.get(k) !== now.searchParams.get(k)) changed.add(k);
    }
    const view = next.searchParams.get("view");
    if (changed.has("view") && view && VIEW_LABEL[view]) return `Mostrando ${VIEW_LABEL[view]}`;
    const search = SEARCH_KEYS.map((k) => (changed.has(k) ? next.searchParams.get(k) : null)).find(Boolean);
    if (search) return `Buscando "${search.length > 40 ? `${search.slice(0, 40)}…` : search}"`;
    if (SEARCH_KEYS.some((k) => changed.has(k))) return "Limpiando la búsqueda";
    if (DATE_KEYS.some((k) => changed.has(k))) return "Cambiando las fechas";
    return "Aplicando filtros";
  }

  const path = next.pathname;
  if (/^\/projects\/[^/]+\/tasks\/[^/]+/.test(path)) return name ? `Abriendo la tarea "${name}"` : "Abriendo la tarea";
  if (/^\/projects\/[^/]+\/?$/.test(path)) {
    const view = next.searchParams.get("view");
    const base = name ? `Abriendo el proyecto "${name}"` : "Abriendo el proyecto";
    return view && VIEW_LABEL[view] && !name ? `${base} · ${VIEW_LABEL[view]}` : base;
  }
  if (/^\/credentials\/[^/]+/.test(path)) return "Abriendo la contraseña";
  for (const [re, label] of SECTION_LABEL) if (re.test(path)) return label;
  return name ? `Abriendo "${name}"` : "Cargando…";
}
