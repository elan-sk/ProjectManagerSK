"use client";

import { Linkify } from "@/lib/linkify";
import { usePasteImage } from "@/lib/usePasteImage";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { DocumentIcon, LinkIcon } from "@/components/icons";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { AttachmentPreviewModal, isPreviewable } from "@/components/AttachmentPreviewModal";
import { AttachmentLightbox } from "./AttachmentLightbox";
import {
  addAdjustmentItem,
  removeAdjustmentItem,
  updateAdjustmentItem,
  setAdjustmentNote,
  addAdjustmentAttachment,
  addAdjustmentLinkAttachment,
  removeAdjustmentAttachment,
} from "./actions";
import { TeamShareThread, type TeamThreadComment } from "./TeamShareThread";
import { reopenAdjustmentReview } from "./shareThreadActions";
import type { AdjustmentAttachmentKind } from "@prisma/client";

type AdjustmentAttachment = { id: string; url: string; name: string; mimeType: string };
type AdjustmentItemData = {
  id: string;
  description: string;
  note: string | null;
  before: AdjustmentAttachment[];
  after: AdjustmentAttachment[];
  clientApproval: boolean | null;
  clientApprovalBy: string | null;
  clientReviewOpen: boolean;
  comments: TeamThreadComment[];
};

/** Punto 2.5: lista de cambios solicitados (Antes/Después) de una tarea tipo Ajuste. */
export function AdjustmentPanel({ taskId, items, userId, canEdit, canDelete, canAttach, canVote }: {
  taskId: string;
  items: AdjustmentItemData[];
  canAttach: boolean;
  canVote: boolean;
  userId: string | null;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!description.trim()) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("description", description);
      const result = await addAdjustmentItem(taskId, formData);
      if (result.ok) {
        setDescription("");
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo agregar el cambio.");
      }
    });
  }

  const pendingCount = items.filter((i) => !i.note && i.after.length === 0).length;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[21px] font-semibold text-slate-900">Cambios solicitados</h2>
        {items.length > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pendingCount > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
            {pendingCount > 0 ? `${pendingCount} pendiente(s)` : "Todo respondido"}
          </span>
        )}
      </div>

      <div className="space-y-5">
        {items.map((item, index) => (
          <AdjustmentItemRow key={item.id} index={index} total={items.length} taskId={taskId} item={item} userId={userId} canEdit={canEdit} canDelete={canDelete} canAttach={canAttach} canVote={canVote} />
        ))}
        {items.length === 0 && <p className="text-[18px] text-slate-400">Sin cambios cargados todavía.</p>}
      </div>

      {canEdit && (
        <div className="flex gap-2 border-t border-slate-100 pt-3">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Describir un cambio solicitado…"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-[18px]"
          />
          <button
            type="button"
            disabled={isPending || !description.trim()}
            onClick={handleAdd}
            className="flex-shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-[18px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
      )}
      {error && <p className="text-[17px] text-red-600">{error}</p>}
    </section>
  );
}

function AdjustmentItemRow({ index, total, taskId, item, userId, canEdit, canDelete, canAttach, canVote }: {
  index: number;
  total: number;
  taskId: string;
  canAttach: boolean;
  canVote: boolean;
  item: AdjustmentItemData;
  userId: string | null;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(item.note ?? "");
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(item.description);
  const [savingNote, setSavingNote] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answered = !!item.note || item.after.length > 0;
  // El cliente pidió cambios: el ajuste no está resuelto aunque ya tenga "Después".
  const needsChanges = item.clientApproval === false && !item.clientReviewOpen;
  const reopened = item.clientApproval !== null && item.clientReviewOpen;

  async function handleReopen() {
    const ok = await confirm("Se habilitará una nueva revisión de este cambio: el cliente podrá calificarlo otra vez desde su link.", { confirmLabel: "Habilitar" });
    if (!ok) return;
    const result = await reopenAdjustmentReview(item.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleSaveNote() {
    setSavingNote(true);
    try {
      await setAdjustmentNote(item.id, note);
      setEditingNote(false);
      router.refresh();
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDeleteItem() {
    const ok = await confirm(`¿Seguro que querés eliminar el cambio "${item.description}"? No vas a poder deshacer esto.`, {
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await removeAdjustmentItem(item.id);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveDescription() {
    setSavingDescription(true);
    setError(null);
    try {
      const result = await updateAdjustmentItem(item.id, description);
      if (!result.ok) {
        setError(result.error ?? "No se pudo editar el cambio.");
        return;
      }
      setEditingDescription(false);
      router.refresh();
    } finally {
      setSavingDescription(false);
    }
  }

  return (
    <div className={`space-y-2 rounded-xl border border-l-4 p-3 shadow-sm ${needsChanges ? "border-amber-400 border-l-amber-500 bg-amber-50" : "border-slate-300 border-l-[#0a6b78] bg-white"}`}>
      <p className="text-[13px] font-semibold uppercase tracking-wide text-[#0a6b78]">Cambio {index + 1} de {total}</p>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${needsChanges || !answered ? "bg-amber-500" : "bg-emerald-500"}`} title={needsChanges ? "El cliente pidió cambios" : answered ? "Respondido" : "Pendiente"} />
          {editingDescription ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <input value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveDescription()} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-[18px]" autoFocus />
              <button type="button" disabled={savingDescription || !description.trim()} onClick={handleSaveDescription} className="text-[17px] font-medium text-slate-700 hover:underline disabled:opacity-50">Guardar</button>
              <button type="button" disabled={savingDescription} onClick={() => { setDescription(item.description); setEditingDescription(false); }} className="text-[17px] text-slate-400 hover:underline">Cancelar</button>
            </div>
          ) : (
            <p className="min-w-0 text-[19px] font-semibold text-slate-800"><Linkify text={item.description} /></p>
          )}
          </div>
        </div>
        {canEdit && !editingDescription && (
          <div className="flex flex-shrink-0 items-center gap-2 text-[17px]">
            <button type="button" onClick={() => setEditingDescription(true)} className="text-slate-400 hover:text-slate-700 hover:underline">Editar</button>
            <button type="button" onClick={handleDeleteItem} disabled={deleting} className="text-slate-400 hover:text-red-600 hover:underline">Eliminar</button>
          </div>
        )}
      </div>
      {error && <p className="text-[17px] text-red-600">{error}</p>}

      {item.clientApproval !== null && (
        reopened ? (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-[15px] text-slate-700">
            Nueva revisión habilitada: se espera que el cliente califique de nuevo. La calificación anterior fue: {item.clientApproval ? "aprobado" : "necesita cambios"}.
          </p>
        ) : item.clientApproval ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
            <p className="text-[15px] font-medium">✓ El cliente aprobó este ajuste{item.clientApprovalBy ? ` · ${item.clientApprovalBy}` : ""}</p>
            {canEdit && (
              <button type="button" onClick={handleReopen} className="text-[13px] underline hover:text-emerald-950">
                Habilitar nueva revisión
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 rounded-lg border border-amber-400 bg-amber-100 px-3 py-2 text-amber-900">
            <p className="text-[15px] font-semibold">⚠ El cliente solicitó cambios en este ajuste{item.clientApprovalBy ? ` · ${item.clientApprovalBy}` : ""}</p>
            <p className="text-[13px]">Falta revisar el comentario, corregir el «Después» y responder en el hilo. Al terminar, se puede habilitar una nueva revisión para que el cliente califique otra vez.</p>
            {canEdit && (
              <button type="button" onClick={handleReopen} className="rounded-lg bg-amber-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-amber-700">
                Habilitar nueva revisión
              </button>
            )}
          </div>
        )
      )}

      <div className="grid grid-cols-2 gap-3">
        <AdjustmentSide label="Antes" kind="BEFORE" itemId={item.id} attachments={item.before} userId={userId} canEdit={canEdit} canDelete={canDelete} />
        <AdjustmentSide label="Después" kind="AFTER" itemId={item.id} attachments={item.after} userId={userId} canEdit={canEdit} canDelete={canDelete} />
      </div>

      {canEdit && item.after.length === 0 && (
        <div>
          {editingNote ? (
            <div className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota: por qué no aplica / no se puede evidenciar…"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px]"
              />
              <button type="button" disabled={savingNote} onClick={handleSaveNote} className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[17px] font-medium text-white hover:bg-slate-800">
                Guardar
              </button>
            </div>
          ) : item.note ? (
            <p className="text-[17px] text-slate-500">
              Nota: <Linkify text={item.note} />{" "}
              <button type="button" onClick={() => setEditingNote(true)} className="text-slate-400 hover:underline">
                Editar
              </button>
            </p>
          ) : (
            <button type="button" onClick={() => setEditingNote(true)} className="text-[17px] text-slate-400 hover:text-slate-600 hover:underline">
              + Agregar nota (si no aplica)
            </button>
          )}
        </div>
      )}

      {(item.comments.length > 0 || canEdit) && (
        <TeamShareThread taskId={taskId} adjustmentItemId={item.id} contextLabel={`Cambio ${index + 1}`} comments={item.comments} canReply={canEdit} canVote={canVote} canAttach={canAttach} />
      )}
    </div>
  );
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.html";

function AdjustmentSide({ label, kind, itemId, attachments, userId, canEdit, canDelete }: {
  label: string;
  kind: AdjustmentAttachmentKind;
  itemId: string;
  attachments: AdjustmentAttachment[];
  userId: string | null;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  usePasteImage(inputRef);
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Imágenes y documentos se abren en los visores de la app (no se descargan directo).
  const [openImageId, setOpenImageId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<AdjustmentAttachment | null>(null);
  const images = attachments.filter((a) => a.mimeType.startsWith("image/")).map((a) => ({ id: a.id, url: a.url, name: a.name, group: label }));

  async function uploadFile(file: File) {
    if (!userId) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "No se pudo subir el archivo");
        return;
      }
      await addAdjustmentAttachment(itemId, kind, body, userId);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "No se pudo subir el archivo");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function saveLink() {
    if (!userId) return;
    setUploading(true);
    setError(null);
    try {
      await addAdjustmentLinkAttachment(itemId, kind, linkUrl.trim(), linkName.trim(), userId);
      setLinkUrl("");
      setLinkName("");
      setAddingLink(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || "Link inválido");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(attachmentId: string, name: string) {
    const ok = await confirm(`¿Seguro que querés eliminar "${name}"? No vas a poder deshacer esto.`, { confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    await removeAdjustmentAttachment(attachmentId);
    router.refresh();
  }

  return (
    <div data-paste-zone className="space-y-1.5 rounded-lg p-2">
      <p className="text-[18px] font-semibold text-slate-600">{label}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {attachments.map((a) => {
          const isImage = a.mimeType.startsWith("image/");
          const isLink = a.mimeType === LINK_MIME_TYPE;
          return (
            <div key={a.id} className="group relative">
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                download={isLink ? undefined : a.name}
                onClick={(e) => {
                  if (isImage) {
                    e.preventDefault();
                    setOpenImageId(a.id);
                  } else if (isPreviewable(a.mimeType)) {
                    e.preventDefault();
                    setPreviewDoc(a);
                  }
                }}
                className="block"
              >
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} className="h-16 w-full rounded-lg border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-16 w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200 p-1 text-center text-[13px] text-slate-500">
                    {isLink ? <LinkIcon className="h-3.5 w-3.5 text-slate-400" /> : <DocumentIcon className="h-3.5 w-3.5 text-slate-400" />}
                    <span className="line-clamp-2 w-full break-words">{a.name}</span>
                  </div>
                )}
              </a>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleDelete(a.id, a.name)}
                  aria-label="Eliminar"
                  className="absolute top-0.5 right-0.5 rounded-full bg-white/90 p-0.5 text-slate-400 opacity-0 shadow-sm hover:text-red-600 group-hover:opacity-100"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        addingLink ? (
          <div className="space-y-1">
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[17px]" />
            <div className="flex gap-1">
              <input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Nombre" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-[17px]" />
              <button type="button" disabled={uploading || !linkUrl.trim() || !linkName.trim()} onClick={saveLink} className="flex-shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-[17px] text-white disabled:opacity-50">
                OK
              </button>
              <button type="button" onClick={() => setAddingLink(false)} className="flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[17px] text-slate-500">
                ✕
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1">
            <label className="flex-1 cursor-pointer rounded-lg border border-dashed border-slate-300 py-1 text-center text-[15px] text-slate-500 hover:border-slate-400">
              {uploading ? "…" : "+ Archivo"}
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
            </label>
            <button type="button" onClick={() => setAddingLink(true)} className="flex-1 rounded-lg border border-dashed border-slate-300 py-1 text-[15px] text-slate-500 hover:border-slate-400">
              + Link
            </button>
          </div>
        )
      )}
      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {openImageId && <AttachmentLightbox images={images} openId={openImageId} onClose={() => setOpenImageId(null)} onNavigate={setOpenImageId} canDelete={false} />}
      {previewDoc && (
        <AttachmentPreviewModal
          file={previewDoc}
          onClose={() => setPreviewDoc(null)}
          onDelete={
            canDelete
              ? async () => {
                  await removeAdjustmentAttachment(previewDoc.id);
                  router.refresh();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
