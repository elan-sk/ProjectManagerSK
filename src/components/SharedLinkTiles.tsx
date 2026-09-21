"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, ShareIcon } from "@/components/icons";

export type SharedLinkItem = { id: string; label: string; token: string; href: string };

/**
 * Links compartidos (proyecto y tareas) como una sección más de la vista. Cada tarjeta ocupa una columna de la
 * grilla, igual que los archivos, con franja de color sólida para distinguirse. Un clic en la
 * tarjeta COPIA el link público; el icono pequeño de la esquina abre la tarea o el proyecto.
 */
export function SharedLinkTiles({ links }: { links: SharedLinkItem[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copy(l: SharedLinkItem) {
    navigator.clipboard.writeText(`${window.location.origin}/share/${l.token}`);
    setCopiedId(l.id);
    setTimeout(() => setCopiedId((id) => (id === l.id ? null : id)), 1500);
  }

  return (
    // Sección como las demás (Links, Imágenes, Documentos): mismo título y misma grilla, sin panel que la aísle.
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0a6b78]">
        <ShareIcon className="h-4 w-4" />
        Links compartidos
        <span className="rounded-full bg-[#0a6b78]/15 px-2 py-0.5 text-xs font-medium">{links.length}</span>
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {links.map((l) => {
          // La etiqueta viene como «Tarea — nombre» o «Proyecto — nombre».
          const [kind, ...rest] = l.label.split(" — ");
          const name = rest.length > 0 ? rest.join(" — ") : l.label;
          const copied = copiedId === l.id;
          return (
            <div key={l.id} className="group relative min-w-0">
              <button
                type="button"
                onClick={() => copy(l)}
                title="Copiar el link compartido"
                className="flex h-24 w-full min-w-0 cursor-pointer items-stretch overflow-hidden rounded-xl border-2 border-[#0a6b78]/40 bg-white text-left shadow-sm transition hover:border-[#0a6b78] hover:shadow"
              >
                <span className="flex w-9 flex-shrink-0 items-center justify-center bg-[#0a6b78] text-white">
                  {copied ? <CheckIcon className="h-4 w-4" /> : <ShareIcon className="h-4 w-4" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-2 pl-2.5 pr-9">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#0a6b78]">{copied ? "¡Link copiado!" : rest.length > 0 ? kind : "Link"}</span>
                  <span className="line-clamp-2 break-words text-sm font-medium text-slate-800">{name}</span>
                </span>
              </button>
              <Link
                href={l.href}
                title={kind === "Proyecto" ? "Abrir el proyecto" : "Abrir la tarea"}
                aria-label={kind === "Proyecto" ? "Abrir el proyecto" : "Abrir la tarea"}
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7M9 7h8v8" />
                </svg>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
