// Paleta saturada para el respaldo del ÍCONO (cuadrado con inicial, texto
// blanco encima) — mismo mecanismo determinístico que avatarColor(), pero en
// hex (acá el color es a veces inline style, no siempre clase de Tailwind).
const DEFAULT_COLORS = ["#e11d48", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0d9488"];

export function defaultProjectColor(name: string) {
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return DEFAULT_COLORS[hash % DEFAULT_COLORS.length];
}

// Paleta CLARA para usar de FONDO en la interfaz (tarjetas de resumen, vista
// del proyecto) — a propósito acotada a colores claros (punto confirmado con
// el usuario) para que el texto slate normal siga siendo legible siempre,
// sin necesitar calcular contraste. Es la única fuente de colores permitida
// tanto para el selector (ProjectIdentityForm) como para el respaldo
// automático cuando el proyecto todavía no eligió uno.
export const LIGHT_PROJECT_COLORS = [
  "#fee2e2", // red-100
  "#ffe4e6", // rose-100
  "#ffedd5", // orange-100
  "#fef3c7", // amber-100
  "#fef9c3", // yellow-100
  "#ecfccb", // lime-100
  "#dcfce7", // green-100
  "#d1fae5", // emerald-100
  "#ccfbf1", // teal-100
  "#cffafe", // cyan-100
  "#e0f2fe", // sky-100
  "#dbeafe", // blue-100
  "#e0e7ff", // indigo-100
  "#ede9fe", // violet-100
  "#f3e8ff", // purple-100
  "#fae8ff", // fuchsia-100
  "#fce7f3", // pink-100
];

export function defaultProjectBgColor(name: string) {
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return LIGHT_PROJECT_COLORS[hash % LIGHT_PROJECT_COLORS.length];
}

/**
 * Identidad visual de un proyecto — a propósito CUADRADA (sin redondeo, no
 * rounded-full) para distinguirse de un vistazo de los avatares circulares
 * de personas (Avatar.tsx), aunque aparezcan uno al lado del otro.
 *
 * El color del proyecto NO tiñe este ícono (punto confirmado con el
 * usuario): el color es para usarlo como fondo en la interfaz (tarjetas de
 * resumen, vista del proyecto); el ícono es una imagen que se usa tal cual,
 * igual que un avatar de persona — si no hay imagen, el respaldo es un
 * cuadrado con inicial en un color automático (mismo mecanismo que
 * avatarColor(), no configurable), no el color elegido del proyecto.
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
