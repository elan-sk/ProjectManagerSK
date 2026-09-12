// Hex (no clases de Tailwind): rose-600/violet-600/teal-600 no están
// retonalizados en globals.css y amber-600 es justo el ámbar de alerta —
// las cuatro se veían fuera de lugar contra el resto del rediseño. Mismo
// mecanismo hex que ProjectIcon.tsx, tonos del Pacífico/Chocó.
const AVATAR_COLORS = ["#096b7c", "#176b4c", "#35608a", "#7a4f9e", "#a3455f", "#1f8a7a"];

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function avatarColor(name: string) {
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function Avatar({
  name,
  avatarUrl,
  size = "h-8 w-8 text-xs",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        title={name}
        className={`flex-shrink-0 rounded-full object-cover ring-2 ring-white ${size}`}
      />
    );
  }
  return (
    <span
      title={name}
      style={{ backgroundColor: avatarColor(name) }}
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-medium text-white ring-2 ring-white ${size}`}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarGroup({ people }: { people: { name: string; avatarUrl?: string | null }[] }) {
  if (people.length === 0) return <span className="text-xs text-slate-400">Sin asignar</span>;
  return (
    <div className="flex -space-x-1.5">
      {people.map((p) => (
        <Avatar key={p.name} name={p.name} avatarUrl={p.avatarUrl} size="h-6 w-6 text-[10px]" />
      ))}
    </div>
  );
}
