import Link from "next/link";

// Paleta saturada para el respaldo del ÍCONO (cuadrado con inicial, texto
// blanco encima) — mismo mecanismo determinístico que avatarColor(), pero en
// hex (acá el color es a veces inline style, no siempre clase de Tailwind).
// Tonos del Pacífico/Chocó (marea, selva, cielo nocturno, orquídea, berry,
// oro mate, cacao, añil, musgo, pizarra, ciruela, ceniza) elegidos a
// propósito lejos del rojo/ámbar de alerta (DESIGN.md). En el rango de verdes
// (musgo/selva) un tercer verde intermedio ("esmeralda", descartado) seguía
// leyéndose como duplicado aunque estuviera a ~38° de distancia en la rueda
// de color — ahí la saturación/luminosidad importan más que el matiz. Por eso
// el 10° tono es un NEUTRO (pizarra, gris-azulado) en vez de forzar un tercer
// verde: dos grises con temperatura distinta (cálido/frío) se distinguen
// mejor que dos verdes apagados a un tercio de rueda de distancia. También
// alimenta el selector de color de las categorías de etiqueta (punto 17,
// Settings > Etiquetas).
export const DEFAULT_COLORS = [
  "#0a6b78",
  "#17664e",
  "#1f4e70",
  "#7a4f9e",
  "#a3455f",
  "#8c7a2b",
  "#6b4226",
  "#3d3a7a",
  "#4f6b2e",
  "#586474",
  "#8f3d84",
  "#5b5750",
];

export function defaultProjectColor(name: string) {
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return DEFAULT_COLORS[hash % DEFAULT_COLORS.length];
}

/**
 * Identidad visual de un proyecto — a propósito CUADRADA (sin redondeo, no
 * rounded-full) para distinguirse de un vistazo de los avatares circulares
 * de personas (Avatar.tsx), aunque aparezcan uno al lado del otro.
 *
 * Ya no hay un color de proyecto elegible ni un fondo de color en tarjetas o
 * vistas (punto confirmado con el usuario: nombre + ícono alcanzan para
 * identificar un proyecto de un vistazo). Sin imagen propia, el respaldo es
 * un cuadrado con inicial en un color automático (DEFAULT_COLORS arriba).
 */
/** `id` (opcional): en el formato «principal | subproyecto» con link, el ícono del principal lleva a su proyecto. */
// Jerarquía sutil (spec 004): borde gris oscuro en el principal y teal de la marca en el subproyecto.
const PARENT_RING = "ring-1! ring-slate-500!";
const CHILD_RING = "ring-1! ring-[#0a6b78]/70!";

export type ProjectIconParent = { id?: string; name: string; iconUrl?: string | null } | null | undefined;

export function ProjectIcon({
  name,
  iconUrl,
  size = "h-6 w-6 text-[10px]",
  projectId,
  parent,
  inline = false,
}: {
  name: string;
  iconUrl?: string | null;
  size?: string;
  /** Si se pasa, el ícono lleva a la vista principal del proyecto (no usar dentro de otro link). */
  projectId?: string;
  /**
   * Subproyecto (spec 004): el ícono del proyecto principal ocupa todo el tamaño y el propio va encima,
   * más pequeño, en la esquina inferior derecha — «este proyecto está dentro de aquel», sin ocupar más ancho.
   */
  parent?: ProjectIconParent;
  /** Íconos muy pequeños (tarjetas): principal | subproyecto lado a lado, porque encimados no se distinguen. */
  inline?: boolean;
}) {
  // «principal | subproyecto» con link: cada ícono lleva a su proyecto. El encimado lleva solo al subproyecto
  // (dos destinos en un ícono tan chico no se pueden tocar bien).
  if (parent && inline && projectId) {
    return (
      <span className="inline-flex shrink-0 items-stretch gap-1">
        {parent.id ? (
          <Link href={`/projects/${parent.id}`} aria-label={`Ir al proyecto ${parent.name}`} className="contents">
            <ProjectIconImage name={parent.name} iconUrl={parent.iconUrl} size={`${size} ${PARENT_RING}`} />
          </Link>
        ) : (
          <ProjectIconImage name={parent.name} iconUrl={parent.iconUrl} size={`${size} ${PARENT_RING}`} />
        )}
        <span className="w-px bg-slate-400" aria-hidden />
        <Link href={`/projects/${projectId}`} aria-label={`Ir al proyecto ${name}`} className="contents">
          <ProjectIconImage name={name} iconUrl={iconUrl} size={`${size} ${CHILD_RING}`} />
        </Link>
      </span>
    );
  }
  const icon = parent && inline ? (
    <span className="inline-flex shrink-0 items-stretch gap-1" title={`${parent.name} › ${name}`}>
      <ProjectIconImage name={parent.name} iconUrl={parent.iconUrl} size={`${size} ${PARENT_RING}`} />
      {/* Separador: barra del alto de los íconos (un «|» de texto quedaba diminuto y no se notaba). */}
      <span className="w-px bg-slate-400" aria-hidden />
      <ProjectIconImage name={name} iconUrl={iconUrl} size={`${size} ${CHILD_RING}`} />
    </span>
  ) : parent ? (
    <span className={`relative inline-flex shrink-0 ${size}`} title={`${parent.name} › ${name}`}>
      <ProjectIconImage name={parent.name} iconUrl={parent.iconUrl} size={`h-full w-full rounded-[inherit] ${PARENT_RING}`} />
      <ProjectIconImage name={name} iconUrl={iconUrl} size="absolute right-0 bottom-0 h-[55%] w-[55%] text-[0.6em] ring-2! ring-[#0a6b78]/70!" />
    </span>
  ) : (
    <ProjectIconImage name={name} iconUrl={iconUrl} size={size} />
  );
  if (!projectId) return icon;
  return (
    <Link href={`/projects/${projectId}`} aria-label={`Ir al proyecto ${name}`} className="contents">
      {icon}
    </Link>
  );
}

function ProjectIconImage({ name, iconUrl, size }: { name: string; iconUrl?: string | null; size: string }) {
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={iconUrl} alt={name} title={name} className={`flex-shrink-0 object-cover ring-1 ring-slate-200 ${size}`} />
    );
  }
  return (
    <span
      title={name}
      style={{ backgroundColor: defaultProjectColor(name) }}
      className={`flex flex-shrink-0 items-center justify-center font-medium text-white ring-1 ring-slate-200 ${size}`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Grupito superpuesto de logos de subproyectos (como los asignados de una tarea). */
export function ProjectIconGroup({ projects, size = "h-5 w-5 text-[9px]", max = 4 }: { projects: { name: string; iconUrl?: string | null }[]; size?: string; max?: number }) {
  if (projects.length === 0) return null;
  const shown = projects.slice(0, max);
  return (
    <span className="flex flex-shrink-0 items-center -space-x-1.5" title={`Subproyectos: ${projects.map((p) => p.name).join(", ")}`}>
      {shown.map((p) => (
        <span key={p.name} className="ring-2 ring-white">
          <ProjectIconImage name={p.name} iconUrl={p.iconUrl} size={size} />
        </span>
      ))}
      {projects.length > max && (
        <span className={`flex items-center justify-center bg-slate-200 font-medium text-slate-600 ring-2 ring-white ${size}`}>+{projects.length - max}</span>
      )}
    </span>
  );
}
