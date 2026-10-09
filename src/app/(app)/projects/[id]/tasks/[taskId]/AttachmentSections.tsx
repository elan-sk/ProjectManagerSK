import { Fragment } from "react";
import { KeyIcon } from "@/components/icons";
import { attachmentFileType, linkKey, type AttachmentFileType } from "@/lib/attachments";
import { AttachmentGrid, type AttachmentGridItem } from "./AttachmentGrid";
import type { PlaceLink } from "./AttachmentPreview";
import { SharedLinkTiles, type SharedLinkItem } from "@/components/SharedLinkTiles";

// Vista «Archivos»: la lista se separa por tipo — links, imágenes y documentos —, cada uno con su título
// y su propia grilla (y su propio visor de imágenes). Un tipo sin archivos no muestra sección.
const SECTIONS: { type: AttachmentFileType; title: string }[] = [
  { type: "credential", title: "Contraseñas" },
  { type: "link", title: "Links" },
  { type: "image", title: "Imágenes" },
  { type: "document", title: "Documentos" },
];

// Una sola columna a todo el ancho (pedido del usuario): Contraseñas, Links compartidos, Links,
// Imágenes y Documentos, cada sección con su grilla completa.
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
  // con la lista de dónde se usa, del uso más reciente al más antiguo (spec 001, RF-7/RF-8).
  const unique = groupByUrl(items);
  const groupOf = (type: AttachmentFileType) => {
    const group = unique.filter((i) => attachmentFileType(i.mimeType) === type);
    return group.length > 0 ? { type, title: SECTIONS.find((s) => s.type === type)!.title, group } : null;
  };

  const renderSection = ({ type, title, group }: NonNullable<ReturnType<typeof groupOf>>) => (
    <section key={type} className="space-y-2.5">
      {type === "credential" ? (
        // Contraseñas: título en rojo con su ícono, como el de Links compartidos (pedido del usuario).
        <h3 className="flex items-center gap-2 text-sm font-semibold text-red-700">
          <KeyIcon className="h-4 w-4" />
          {title}
          <span className="rounded-full bg-red-600/15 px-2 py-0.5 text-xs font-medium">{group.length}</span>
        </h3>
      ) : (
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {title}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{group.length}</span>
        </h3>
      )}
      <AttachmentGrid items={group} canDelete={canDelete} className={className} credentialLayout="card" />
    </section>
  );

  return (
    <div className="space-y-6">
      {/* Contraseñas primero, luego Links compartidos y el resto (pedido del usuario). */}
      {SECTIONS.map(({ type }) => groupOf(type)).map((g, i) => (
        <Fragment key={i}>
          {g && renderSection(g)}
          {i === 0 && sharedLinks.length > 0 && <SharedLinkTiles links={sharedLinks} className={className} />}
        </Fragment>
      ))}
    </div>
  );
}

function groupByUrl(items: AttachmentGridItem[]): AttachmentGridItem[] {
  const byUrl = new Map<string, AttachmentGridItem & { usedIn: PlaceLink[] }>();
  for (const item of items) {
    const key = linkKey(item.url); // mismo link aunque cambie el nombre o un detalle de la dirección
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, { ...item, usedIn: item.taskLink ? [item.taskLink] : [] });
      continue;
    }
    if (item.taskLink && !existing.usedIn.some((u) => u.href === item.taskLink!.href && u.title === item.taskLink!.title)) existing.usedIn.push(item.taskLink);
    // Usado en varios lugares: se borra desde cada tarea, no desde la ficha agrupada.
    existing.canDelete = false;
    // Llegan de lo más reciente a lo más antiguo: el nombre queda el de la primera carga (RF-8).
    existing.name = item.name;
  }
  return [...byUrl.values()];
}
