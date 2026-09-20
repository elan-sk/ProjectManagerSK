/**
 * Texto de las zonas de subida (arrastrar / pegar): el título en una línea y la
 * ayuda debajo, más chica y apagada, en vez de todo junto entre paréntesis
 * (que se partía en dos líneas desparejas).
 */
export function UploadZoneLabel({ uploading, dragOver, label, progress }: { uploading: boolean; dragOver: boolean; label: string; progress?: number }) {
  if (uploading) {
    if (progress === undefined) return <>Subiendo…</>;
    const pct = Math.round(progress * 100);
    return (
      <span className="flex w-full max-w-xs flex-col items-center gap-1">
        <span className="font-medium">Subiendo… {pct}%</span>
        <span className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <span className="block h-full rounded-full bg-[#0a6b78] transition-[width]" style={{ width: `${pct}%` }} />
        </span>
      </span>
    );
  }
  if (dragOver) return <>Soltá el archivo acá</>;
  return (
    <span className="flex flex-col items-center gap-0.5 text-center">
      <span className="font-medium">{label}</span>
      <span className="paste-idle text-[11px] font-normal text-slate-400">Arrastralo o pegá una captura</span>
      {/* Reemplaza a la ayuda cuando esta zona es la que recibiría el Ctrl+V (ver globals.css). */}
      <span className="paste-ready text-[11px] font-semibold text-[#0a6b78]">Ctrl+V para pegar aquí</span>
    </span>
  );
}
