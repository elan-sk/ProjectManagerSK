const AVATAR_COLORS = [
  "bg-rose-600",
  "bg-blue-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-violet-600",
  "bg-teal-600",
];

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
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-medium text-white ring-2 ring-white ${size} ${avatarColor(name)}`}
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
