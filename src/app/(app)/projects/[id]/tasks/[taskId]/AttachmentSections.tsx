import { attachmentFileType, type AttachmentFileType } from "@/lib/attachments";
import { AttachmentGrid, type AttachmentGridItem } from "./AttachmentGrid";

// Vista «Archivos»: la lista se separa por tipo — links, imágenes y documentos —, cada uno con su título
// y su propia grilla (y su propio visor de imágenes). Un tipo sin archivos no muestra sección.
const SECTIONS: { type: AttachmentFileType; title: string }[] = [
  { type: "link", title: "Links" },
  { type: "image", title: "Imágenes" },
  { type: "document", title: "Documentos" },
];

// Pantalla grande (spec 003): con dos o más tipos, dos columnas con la grilla a
// media columna — Imágenes a la izquierda (o, sin imágenes, el primer tipo) y el
// resto a la derecha. Un solo tipo va a todo el ancho. En pantallas chicas, apilado.
const HALF_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-3";

export function AttachmentSections({ items, canDelete, className }: { items: AttachmentGridItem[]; canDelete: boolean; className?: string }) {
  const groups = SECTIONS.map(({ type, title }) => ({ type, title, group: items.filter((i) => attachmentFileType(i.mimeType) === type) })).filter(
    (g) => g.group.length > 0
  );
  const leftType = groups.some((g) => g.type === "image") ? "image" : groups[0]?.type;
  const left = groups.filter((g) => g.type === leftType);
  const right = groups.filter((g) => g.type !== leftType);
  const split = left.length > 0 && right.length > 0;

  const renderSection = ({ type, title, group }: (typeof groups)[number]) => (
    <section key={type} className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{group.length}</span>
      </h3>
      <AttachmentGrid items={group} canDelete={canDelete} className={split ? HALF_GRID : className} />
    </section>
  );

  if (!split) return <div className="space-y-6">{groups.map(renderSection)}</div>;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-6">{left.map(renderSection)}</div>
      <div className="space-y-6">{right.map(renderSection)}</div>
    </div>
  );
}
