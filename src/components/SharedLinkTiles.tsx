import Link from "next/link";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { LinkIcon } from "@/components/icons";

export type SharedLinkItem = { id: string; label: string; token: string; href: string };

/**
 * Links compartidos (proyecto y tareas) en un grupo resaltado, con tarjetas del
 * mismo tamaño que las de los links normales (h-24, una columna de la grilla)
 * pero con franja de color sólida, borde marcado y etiqueta del tipo, para que
 * se distingan del resto de los archivos. El botón copia el link público.
 */
export function SharedLinkTiles({ links }: { links: SharedLinkItem[] }) {
  return (
    <div className="space-y-2.5 rounded-2xl border border-[#0a6b78]/25 bg-[#0a6b78]/5 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#0a6b78]">
        <LinkIcon className="h-4 w-4" />
        Links compartidos
        <span className="rounded-full bg-[#0a6b78]/15 px-2 py-0.5 text-xs font-medium">{links.length}</span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {links.map((l) => {
          // La etiqueta viene como «Tarea — nombre» o «Proyecto — nombre».
          const [kind, ...rest] = l.label.split(" — ");
          const name = rest.length > 0 ? rest.join(" — ") : l.label;
          return (
            <div key={l.id} className="group relative min-w-0">
              <Link
                href={l.href}
                className="flex h-24 w-full min-w-0 items-stretch overflow-hidden rounded-xl border-2 border-[#0a6b78]/40 bg-white shadow-sm transition hover:border-[#0a6b78] hover:shadow"
              >
                <span className="flex w-9 flex-shrink-0 items-center justify-center bg-[#0a6b78] text-white">
                  <LinkIcon className="h-4 w-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-2 pl-2.5 pr-9">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#0a6b78]">{rest.length > 0 ? kind : "Link"}</span>
                  <span className="line-clamp-2 break-words text-sm font-medium text-slate-800">{name}</span>
                </span>
              </Link>
              <CopyLinkButton
                token={l.token}
                className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
