/**
 * Texto de las zonas de subida (arrastrar / pegar): el título en una línea y la
 * ayuda debajo, más chica y apagada, en vez de todo junto entre paréntesis
 * (que se partía en dos líneas desparejas).
 */
export function UploadZoneLabel({ uploading, dragOver, label }: { uploading: boolean; dragOver: boolean; label: string }) {
  if (uploading) return <>Subiendo…</>;
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
