import { attachmentFileType, type AttachmentFileType } from "@/lib/attachments";
import { AttachmentGrid, type AttachmentGridItem } from "./AttachmentGrid";
import { SharedLinkTiles, type SharedLinkItem } from "@/components/SharedLinkTiles";

// Vista «Archivos»: la lista se separa por tipo — links, imágenes y documentos —, cada uno con su título
// y su propia grilla (y su propio visor de imágenes). Un tipo sin archivos no muestra sección.
const SECTIONS: { type: AttachmentFileType; title: string }[] = [
  { type: "link", title: "Links" },
  { type: "image", title: "Imágenes" },
  { type: "document", title: "Documentos" },
];

// Pantalla grande, en dos filas (pedido del usuario):
//  1. Links: los compartidos a la izquierda y los externos a la derecha.
//  2. Archivos: Imágenes a la izquierda y Documentos a la derecha.
// En cada fila, si hay solo uno de los dos, ocupa la fila entera. En pantallas
// chicas, todo apilado.
const HALF_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-3";

export function AttachmentSections({
  items,
  canDelete,
  className,
  sharedLinks = [],
}: {
  items: AttachmentGridItem[];
  canDelete: boolean;
  className?: string;
  sharedLinks?: SharedLinkItem[];
}) {
  // Un mismo archivo (misma dirección) usado en varias tareas se muestra una sola vez,
  // con la lista de dónde se usa (spec 001, RF-7/RF-8: nombre de la primera ficha).
  const unique = groupByUrl(items);
  const groupOf = (type: AttachmentFileType) => {
    const group = unique.filter((i) => attachmentFileType(i.mimeType) === type);
    return group.length > 0 ? { type, title: SECTIONS.find((s) => s.type === type)!.title, group } : null;
  };

  const renderSection = ({ type, title, group }: NonNullable<ReturnType<typeof groupOf>>, half: boolean) => (
    <section key={type} className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{group.length}</span>
      </h3>
      <AttachmentGrid items={group} canDelete={canDelete} className={half ? HALF_GRID : className} />
    </section>
  );

  const links = groupOf("link");
  const images = groupOf("image");
  const documents = groupOf("document");
  const linksHalf = sharedLinks.length > 0 && links !== null;
  const filesHalf = images !== null && documents !== null;

  return (
    <div className="space-y-6">
      {(sharedLinks.length > 0 || links) && (
        <div className={`grid grid-cols-1 gap-6 ${linksHalf ? "lg:grid-cols-2" : ""}`}>
          {sharedLinks.length > 0 && <SharedLinkTiles links={sharedLinks} singleColumn={linksHalf} />}
          {links && renderSection(links, linksHalf)}
        </div>
      )}
      {(images || documents) && (
        <div className={`grid grid-cols-1 gap-6 ${filesHalf ? "lg:grid-cols-2" : ""}`}>
          {images && renderSection(images, filesHalf)}
          {documents && renderSection(documents, filesHalf)}
        </div>
      )}
    </div>
  );
}

function groupByUrl(items: AttachmentGridItem[]): AttachmentGridItem[] {
  const byUrl = new Map<string, AttachmentGridItem & { usedIn: { href: string; title: string }[] }>();
  for (const item of items) {
    const key = item.url.trim();
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, { ...item, usedIn: item.taskLink ? [item.taskLink] : [] });
      continue;
    }
    if (item.taskLink && !existing.usedIn.some((u) => u.href === item.taskLink!.href)) existing.usedIn.push(item.taskLink);
    // Usado en varios lugares: se borra desde cada tarea, no desde la ficha agrupada.
    existing.canDelete = false;
  }
  return [...byUrl.values()];
}
