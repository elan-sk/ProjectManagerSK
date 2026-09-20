"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { useConfirm } from "@/components/Confirm";
import { deleteInternalMessage, editInternalMessage } from "@/app/(app)/internalMessageActions";
import { COMMENT_EDIT_WINDOW_MS, COMMENT_MAX_LENGTH, splitCommentBody } from "@/lib/commentBody";
import { useNow } from "@/lib/useNow";
import { DocumentIcon, LinkIcon } from "@/components/icons";
import { YouTubeModal } from "@/components/YouTubeModal";
import { youtubeVideoId } from "@/lib/attachments";
// El mismo visor de imágenes que usan los archivos (Insumos, Evidencias, Archivos).
import { AttachmentLightbox } from "@/app/(app)/projects/[id]/tasks/[taskId]/AttachmentLightbox";

type Props = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  /** Ya formateada en el servidor (así el navegador no la recalcula con otra zona horaria). */
  createdLabel: string;
  createdAtMs: number;
  body: string;
  edited?: boolean;
  currentUserId: string;
};

/** Botones «Editar · Eliminar» del autor: solo se ven durante los primeros 5 minutos (con cuenta regresiva). */
function OwnControls({ createdAtMs, disabled, onEdit, onDelete }: { createdAtMs: number; disabled: boolean; onEdit: () => void; onDelete: () => void }) {
  const now = useNow();
  const left = COMMENT_EDIT_WINDOW_MS - (now - createdAtMs);
  if (now === 0 || left <= 0) return null;
  const secs = Math.ceil(left / 1000);
  return (
    <span className="ml-2 inline-flex items-center gap-2 text-xs">
      <button type="button" onClick={onEdit} disabled={disabled} className="cursor-pointer text-slate-500 hover:text-slate-900 hover:underline disabled:opacity-50">
        Editar
      </button>
      <button type="button" onClick={onDelete} disabled={disabled} className="cursor-pointer text-slate-500 hover:text-red-600 hover:underline disabled:opacity-50">
        Eliminar
      </button>
      <span className="text-slate-400" title="Tiempo que queda para editar o eliminar">
        {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
      </span>
    </span>
  );
}

export function CommentItem({ id, authorId, authorName, authorAvatarUrl, createdLabel, createdAtMs, body, edited, currentUserId }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openImage, setOpenImage] = useState<string | null>(null);
  // Los enlaces de YouTube se ven en el visor integrado en vez de abrir otra pestaña.
  const [openVideo, setOpenVideo] = useState<{ id: string; name: string } | null>(null);

  // Imágenes de ESTE comentario: el visor navega entre ellas con ‹ › o las flechas.
  const parts = splitCommentBody(body);
  const images = parts.flatMap((p) => (p.type === "image" ? [p.url] : [])).map((url, i) => ({ id: `${id}:${i}`, url, name: `Captura ${i + 1}.${url.split(".").pop()}` }));

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await editInternalMessage(id, draft);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo guardar el comentario.");
      }
    });
  }

  async function remove() {
    const ok = await confirm("¿Eliminar este comentario? No se puede deshacer.", { confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteInternalMessage(id);
      if (result.ok) router.refresh();
      else setError(result.error ?? "No se pudo eliminar el comentario.");
    });
  }

  return (
    <article className="flex gap-2">
      <Avatar name={authorName} avatarUrl={authorAvatarUrl} size="h-7 w-7 text-[10px]" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-700">
          {authorName} <span className="font-normal text-slate-400">{createdLabel}{edited ? " · editado" : ""}</span>
          {authorId === currentUserId && !editing && (
            <OwnControls createdAtMs={createdAtMs} disabled={pending} onEdit={() => { setDraft(body); setError(null); setEditing(true); }} onDelete={remove} />
          )}
        </p>

        {editing ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={COMMENT_MAX_LENGTH}
              aria-label="Editar comentario"
              autoFocus
              className="block min-h-16 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0a6b78] focus:ring-2 focus:ring-[#0a6b78]/40"
            />
            <div className="flex gap-2">
              <button type="button" onClick={save} disabled={pending || !draft.trim()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {pending ? "Guardando…" : "Guardar"}
              </button>
              <button type="button" onClick={() => { setEditing(false); setError(null); }} disabled={pending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-700">
            {parts.map((part, i) => {
              if (part.type === "text") return <span key={i} className="whitespace-pre-wrap">{part.text}</span>;
              if (part.type === "mention")
                return <span key={i} className="rounded bg-[#0a6b78]/10 px-1 font-medium text-[#0a6b78]">@{part.name}</span>;
              const videoId = part.type === "link" ? youtubeVideoId(part.url) : null;
              if (part.type === "link" && videoId)
                return (
                  <button key={i} type="button" onClick={() => setOpenVideo({ id: videoId, name: part.name })} title="Ver el video aquí" className="mx-0.5 inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100">
                    <span aria-hidden>▶</span>
                    <span className="truncate">{part.name}</span>
                  </button>
                );
              if (part.type === "file" || part.type === "link")
                return (
                  <a key={i} href={part.url} target="_blank" rel="noreferrer" className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                    {part.type === "file" ? <DocumentIcon className="h-3.5 w-3.5 shrink-0" /> : <LinkIcon className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{part.name}</span>
                  </a>
                );
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setOpenImage(images[parts.slice(0, i).filter((p) => p.type === "image").length].id)}
                  aria-label="Ver imagen"
                  className="my-1 block w-fit cursor-zoom-in"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={part.url} alt="Imagen del comentario" className="max-h-64 max-w-full rounded-lg border border-slate-200" />
                </button>
              );
            })}
          </div>
        )}
        {openImage && <AttachmentLightbox images={images} openId={openImage} onClose={() => setOpenImage(null)} onNavigate={setOpenImage} canDelete={false} />}
        {openVideo && <YouTubeModal videoId={openVideo.id} title={openVideo.name} onClose={() => setOpenVideo(null)} />}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </article>
  );
}
