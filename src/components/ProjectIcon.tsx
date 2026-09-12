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
export function ProjectIcon({
  name,
  iconUrl,
  size = "h-6 w-6 text-[10px]",
}: {
  name: string;
  iconUrl?: string | null;
  size?: string;
}) {
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
