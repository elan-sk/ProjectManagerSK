// Header mínimo de las vistas compartidas — sin menú de la app, sin datos
// de sesión (quien entra por acá no tiene cuenta ni la necesita).
export function PublicHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="border-b border-slate-200 bg-white px-6 py-4">
      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">ProjectManagerSK</p>
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </header>
  );
}
