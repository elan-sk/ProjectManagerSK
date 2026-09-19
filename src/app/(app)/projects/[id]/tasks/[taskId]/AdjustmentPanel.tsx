"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { DocumentIcon, LinkIcon } from "@/components/icons";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import {
  addAdjustmentItem,
  removeAdjustmentItem,
  updateAdjustmentItem,
  setAdjustmentNote,
  addAdjustmentAttachment,
  addAdjustmentLinkAttachment,
  removeAdjustmentAttachment,
} from "./actions";
import type { AdjustmentAttachmentKind } from "@prisma/client";

type AdjustmentAttachment = { id: string; url: string; name: string; mimeType: string };
type AdjustmentItemData = {
  id: string;
  description: string;
  note: string | null;
  before: AdjustmentAttachment[];
  after: AdjustmentAttachment[];
};

/** Punto 2.5: lista de cambios solicitados (Antes/Después) de una tarea tipo Ajuste. */
export function AdjustmentPanel({ taskId, items, userId, canEdit, canDelete }: {
  taskId: string;
  items: AdjustmentItemData[];
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
        <h2 className="font-medium text-slate-900">Cambios solicitados</h2>
        {items.length > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pendingCount > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
            {pendingCount > 0 ? `${pendingCount} pendiente(s)` : "Todo respondido"}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <AdjustmentItemRow key={item.id} item={item} userId={userId} canEdit={canEdit} canDelete={canDelete} />
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400">Sin cambios cargados todavía.</p>}
      </div>

      {canEdit && (
        <div className="flex gap-2 border-t border-slate-100 pt-3">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Describir un cambio solicitado…"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={isPending || !description.trim()}
            onClick={handleAdd}
            className="flex-shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}

function AdjustmentItemRow({ item, userId, canEdit, canDelete }: {
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
    <div className="space-y-2 rounded-lg border border-slate-100 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${answered ? "bg-emerald-500" : "bg-amber-500"}`} title={answered ? "Respondido" : "Pendiente"} />
          {editingDescription ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <input value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveDescription()} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm" autoFocus />
              <button type="button" disabled={savingDescription || !description.trim()} onClick={handleSaveDescription} className="text-xs font-medium text-slate-700 hover:underline disabled:opacity-50">Guardar</button>
              <button type="button" disabled={savingDescription} onClick={() => { setDescription(item.description); setEditingDescription(false); }} className="text-xs text-slate-400 hover:underline">Cancelar</button>
            </div>
          ) : (
            <p className="min-w-0 text-sm font-medium text-slate-800">{item.description}</p>
          )}
          </div>
        </div>
        {canEdit && !editingDescription && (
          <div className="flex flex-shrink-0 items-center gap-2 text-xs">
            <button type="button" onClick={() => setEditingDescription(true)} className="text-slate-400 hover:text-slate-700 hover:underline">Editar</button>
            <button type="button" onClick={handleDeleteItem} disabled={deleting} className="text-slate-400 hover:text-red-600 hover:underline">Eliminar</button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

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
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <button type="button" disabled={savingNote} onClick={handleSaveNote} className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
                Guardar
              </button>
            </div>
          ) : item.note ? (
            <p className="text-xs text-slate-500">
              Nota: {item.note}{" "}
              <button type="button" onClick={() => setEditingNote(true)} className="text-slate-400 hover:underline">
                Editar
              </button>
            </p>
          ) : (
            <button type="button" onClick={() => setEditingNote(true)} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
              + Agregar nota (si no aplica)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";

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
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {attachments.map((a) => {
          const isImage = a.mimeType.startsWith("image/");
          const isLink = a.mimeType === LINK_MIME_TYPE;
          return (
            <div key={a.id} className="group relative">
              <a href={a.url} target="_blank" rel="noreferrer" download={isLink ? undefined : a.name} className="block">
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} className="h-16 w-full rounded-lg border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-16 w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200 p-1 text-center text-[10px] text-slate-500">
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
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs" />
            <div className="flex gap-1">
              <input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Nombre" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
              <button type="button" disabled={uploading || !linkUrl.trim() || !linkName.trim()} onClick={saveLink} className="flex-shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50">
                OK
              </button>
              <button type="button" onClick={() => setAddingLink(false)} className="flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500">
                ✕
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1">
            <label className="flex-1 cursor-pointer rounded-lg border border-dashed border-slate-300 py-1 text-center text-[11px] text-slate-500 hover:border-slate-400">
              {uploading ? "…" : "+ Archivo"}
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
            </label>
            <button type="button" onClick={() => setAddingLink(true)} className="flex-1 rounded-lg border border-dashed border-slate-300 py-1 text-[11px] text-slate-500 hover:border-slate-400">
              + Link
            </button>
          </div>
        )
      )}
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
