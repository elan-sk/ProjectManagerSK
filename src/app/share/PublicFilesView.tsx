"use client";

import { PublicFileGrid } from "./PublicFileGrid";
import { PublicUploadWidget } from "./PublicUploadWidget";
import { addPublicProjectAttachment, addPublicProjectLink } from "./shareActions";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import type { PublicFile } from "@/lib/publicView";

// Archivos y links del proyecto (punto 15 confirmado con el usuario): ver y
// descargar todo (con el mismo visor de PDF/Word/Excel de adentro de la
// app), subir archivos y links, nunca eliminar — no hay ningún botón de
// borrar en esta vista, a propósito.
export function PublicFilesView({
  token,
  attachments,
  links,
}: {
  token: string;
  attachments: PublicFile[];
  links: { id: string; title: string; url: string }[];
}) {
  async function uploadFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("token", token);
    const res = await fetch("/api/upload/public", { method: "POST", body: formData });
    const body = await res.json();
    if (!res.ok) return body.error ?? "No se pudo subir el archivo.";
    const result = await addPublicProjectAttachment(token, body);
    if (!result.ok) return "error" in result ? result.error : "No se pudo guardar el archivo.";
  }

  async function addLink(url: string, name: string) {
    const result = await addPublicProjectLink(token, url, name);
    if (!result.ok) return result.error;
  }

  const files: PublicFile[] = [
    ...attachments,
    ...links.map((l) => ({ id: l.id, url: l.url, name: l.title, mimeType: LINK_MIME_TYPE })),
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-[21px] font-semibold text-slate-900">Archivos y links del proyecto</h2>
        <PublicFileGrid files={files} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-[21px] font-semibold text-slate-900">Subir archivo o link</h2>
        <PublicUploadWidget onUploadFile={uploadFile} onAddLink={addLink} label="+ Subir archivo" />
      </div>
    </div>
  );
}
