import { attachmentFileType, type AttachmentFileType } from "@/lib/attachments";
import { AttachmentGrid, type AttachmentGridItem } from "./AttachmentGrid";

// Vista «Archivos»: la lista se separa por tipo — links, imágenes y documentos —, cada uno con su título
// y su propia grilla (y su propio visor de imágenes). Un tipo sin archivos no muestra sección.
const SECTIONS: { type: AttachmentFileType; title: string }[] = [
  { type: "link", title: "Links" },
  { type: "image", title: "Imágenes" },
  { type: "document", title: "Documentos" },
];

export function AttachmentSections({ items, canDelete, className }: { items: AttachmentGridItem[]; canDelete: boolean; className?: string }) {
  return (
    <div className="space-y-6">
      {SECTIONS.map(({ type, title }) => {
        const group = items.filter((i) => attachmentFileType(i.mimeType) === type);
        if (group.length === 0) return null;
        return (
          <section key={type} className="space-y-2.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              {title}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{group.length}</span>
            </h3>
            <AttachmentGrid items={group} canDelete={canDelete} className={className} />
          </section>
        );
      })}
    </div>
  );
}
