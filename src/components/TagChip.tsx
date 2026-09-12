// Punto 17: la etiqueta siempre se ve igual en cualquier lado de la app —
// color/emoji de la categoría + el nombre puntual (ej. 🧩 hero-banner). El
// color es un hex arbitrario de la paleta de proyectos, no una clase de
// Tailwind fija, así que el tinte de fondo se arma en línea (mismo hex con
// alfa bajo) en vez de mapear cada hex a una clase.
export function TagChip({
  colorHex,
  emoji,
  name,
  onRemove,
}: {
  colorHex: string;
  emoji?: string | null;
  name: string;
  onRemove?: () => void;
}) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${colorHex}1f`, color: colorHex }}
    >
      {emoji ? <span aria-hidden>{emoji}</span> : <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: colorHex }} aria-hidden />}
      <span className="truncate">{name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Quitar etiqueta ${name}`} className="flex-shrink-0 opacity-60 hover:opacity-100">
          ✕
        </button>
      )}
    </span>
  );
}
