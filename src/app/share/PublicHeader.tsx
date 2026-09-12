// Header de las vistas compartidas — solo la marca de la app (sin menú, sin
// datos de sesión: quien entra por acá no tiene cuenta ni la necesita). El
// ícono del proyecto y el título van en el cuerpo, no acá — repetirlos en
// las dos partes quedaba redundante.
export function PublicHeader() {
  return (
    <header className="pacific-header relative flex items-center gap-2 px-4 py-3 sm:px-6">
      <span className="pacific-brand-mark" aria-hidden>
        <span className="relative z-10 font-display text-xs font-bold">PM</span>
      </span>
      <span className="font-display text-sm tracking-[-0.01em]">
        ProjectManager<span style={{ color: "var(--sand-warm)" }}>SK</span>
      </span>
    </header>
  );
}
