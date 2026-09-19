"use client";

import { usePasteImage } from "@/lib/usePasteImage";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { DocumentIcon, LinkIcon } from "@/components/icons";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { AttachmentPreviewModal, isPreviewable } from "@/components/AttachmentPreviewModal";
import { AttachmentLightbox } from "./AttachmentLightbox";
import {
  submitAcceptanceRound,
  addAcceptanceDeliverable,
  addAcceptanceDeliverableLink,
  addAcceptanceItem,
  removeAcceptanceItem,
  addAcceptanceItemEvidence,
  addAcceptanceItemEvidenceLink,
  removeAcceptanceItemEvidence,
  completeAcceptanceTask,
  addAcceptanceMessage,
  editAcceptanceMessage,
} from "./acceptanceActions";
import type { TaskStatus } from "@prisma/client";

type FileRef = { id: string; url: string; name: string; mimeType: string };
type Item = {
  id: string;
  title: string;
  criteria: string | null;
  category: string | null;
  result: "APPROVED" | "FAILED" | null;
  note: string | null;
  reviewedByExternalName: string | null;
  reviewedByExternalRole: string | null;
  evidence: FileRef[];
};
type Message = { id: string; authorId: string; authorName: string; body: string; editedAt: string | null; createdAt: string };
type Round = {
  id: string;
  roundNumber: number;
  submittedByName: string;
  submittedAt: string;
  outcome: "APPROVED" | "RETURNED" | null;
  deliverables: FileRef[];
  items: Item[];
  messages: Message[];
};

const RESULT_LABEL: Record<"APPROVED" | "FAILED", string> = { APPROVED: "Aceptada por el cliente", FAILED: "Devuelta por el cliente" };
const RESULT_COLOR: Record<"APPROVED" | "FAILED", string> = { APPROVED: "bg-emerald-600 text-white", FAILED: "bg-red-600 text-white" };
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";

function FileChip({ file, onClick }: { file: FileRef; onClick?: () => void }) {
  const isLink = file.mimeType === LINK_MIME_TYPE;
  const className = "flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50";
  const content = (
    <>
      {isLink ? <LinkIcon className="h-3.5 w-3.5 text-slate-400" /> : <DocumentIcon className="h-3.5 w-3.5 text-slate-400" />}
      <span className="max-w-[10rem] truncate">{file.name}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }
  return (
    <a href={file.url} target="_blank" rel="noreferrer" download={isLink ? undefined : file.name} className={className}>
      {content}
    </a>
  );
}

function FileChips({ files, onRemove }: { files: FileRef[]; onRemove?: (id: string) => void }) {
  const [openImageId, setOpenImageId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<FileRef | null>(null);
  const images = files.filter((f) => f.mimeType.startsWith("image/"));

  return (
    <>
      {files.map((file) => {
        const isImage = file.mimeType.startsWith("image/");
        const onClick = isImage ? () => setOpenImageId(file.id) : isPreviewable(file.mimeType) ? () => setPreviewDoc(file) : undefined;
        return (
          <div key={file.id} className="group relative">
            <FileChip file={file} onClick={onClick} />
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                aria-label="Eliminar evidencia"
                className="absolute -top-1 -right-1 rounded-full bg-white p-0.5 text-slate-400 opacity-0 shadow-sm hover:text-red-600 group-hover:opacity-100"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      {openImageId && <AttachmentLightbox images={images} openId={openImageId} onClose={() => setOpenImageId(null)} onNavigate={setOpenImageId} canDelete={false} />}
      {previewDoc && <AttachmentPreviewModal file={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </>
  );
}

/** Lista de características a aceptar/devolver por el cliente vía link compartido — mismo motor de rondas que Prueba (QA), ver acceptanceActions.ts. */
export function AcceptancePanel({ taskId, userId, canEdit, rounds, taskStatus }: {
  taskId: string;
  userId: string | null;
  canEdit: boolean;
  rounds: Round[];
  taskStatus: TaskStatus;
}) {
  const activeRound = rounds.find((r) => r.outcome === null) ?? null;
  const closedRounds = rounds.filter((r) => r.outcome !== null);
  const lastRound = rounds[0] ?? null;
  const isDone = taskStatus === "COMPLETED";

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">Aceptación</h2>

      {activeRound ? (
        <ActiveRound round={activeRound} userId={userId} canEdit={canEdit} />
      ) : (
        !isDone && (
          <>
            {canEdit && lastRound?.outcome === "RETURNED" && <CorrectionPanel round={lastRound} />}
            {canEdit && (
              <SubmitRoundForm
                taskId={taskId}
                nextRoundNumber={rounds.length + 1}
                initialItems={lastRound?.outcome === "RETURNED" ? lastRound.deliverables : undefined}
              />
            )}
          </>
        )
      )}

      {canEdit && !isDone && !activeRound && lastRound?.outcome === "APPROVED" && <CompleteTaskButton taskId={taskId} />}

      {closedRounds.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-500">Rondas anteriores</p>
          {closedRounds.map((round) => (
            <details key={round.id} className="rounded-lg border border-slate-100 p-2 text-sm">
              <summary className="cursor-pointer text-slate-600">
                Ronda {round.roundNumber} —{" "}
                <span className={round.outcome === "APPROVED" ? "text-emerald-600" : "text-orange-600"}>
                  {round.outcome === "APPROVED" ? "Aceptada" : "Devuelta"}
                </span>{" "}
                · enviada por {round.submittedByName}
              </summary>
              <div className="mt-2 space-y-2 pl-2">
                <ItemList items={round.items} readOnly />
                <Chat round={round} userId={userId} canComment={canEdit} />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function CorrectionPanel({ round }: { round: Round }) {
  const returnedItems = round.items.filter((i) => i.result === "FAILED");
  if (returnedItems.length === 0) return null;
  const allWithEvidence = returnedItems.every((i) => i.evidence.length > 0);
  return (
    <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/60 p-3">
      <p className="text-sm font-medium text-orange-800">
        El cliente devolvió {returnedItems.length} característica(s) — subí evidencia de la corrección antes de reenviar (ronda {round.roundNumber})
      </p>
      <ItemList items={returnedItems} canEdit />
      {!allWithEvidence && <p className="text-xs text-orange-600">Faltan características por corregir con evidencia.</p>}
    </div>
  );
}

function CompleteTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleClick() {
    const ok = await confirm("El cliente ya aceptó toda la entrega. ¿Marcar esta tarea como completada?", { confirmLabel: "Sí, completar" });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await completeAcceptanceTask(taskId);
      if (result.ok) router.refresh();
      else setError(result.error ?? "No se pudo completar la tarea.");
    });
  }

  return (
    <div className="space-y-1 border-t border-slate-100 pt-3">
      <button type="button" disabled={isPending} onClick={handleClick} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        Completar tarea
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SubmitRoundForm({ taskId, nextRoundNumber, initialItems = [] }: {
  taskId: string;
  nextRoundNumber: number;
  initialItems?: { id: string; name: string; url: string; mimeType: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  usePasteImage(inputRef);
  const [items, setItems] = useState<{ id?: string; name: string; url: string; mimeType: string }[]>(initialItems);
  const [addingLink, setAddingLink] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "No se pudo subir el archivo.");
        return;
      }
      setItems((prev) => [...prev, { name: body.name, url: body.url, mimeType: body.mimeType }]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function addLink() {
    if (!linkName.trim() || !linkUrl.trim()) return;
    setItems((prev) => [...prev, { name: linkName.trim(), url: linkUrl.trim(), mimeType: LINK_MIME_TYPE }]);
    setLinkName("");
    setLinkUrl("");
    setAddingLink(false);
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit() {
    if (items.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await submitAcceptanceRound(taskId, items);
      if (result.ok) {
        setItems([]);
        router.refresh();
      } else setError(result.error ?? "No se pudo enviar.");
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
      <p className="text-sm text-slate-600">{nextRoundNumber === 1 ? "Enviar a aceptación del cliente" : `Reenviar (ronda ${nextRoundNumber})`}</p>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span key={i} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600">
              {it.mimeType === LINK_MIME_TYPE ? <LinkIcon className="h-3.5 w-3.5 text-slate-400" /> : <DocumentIcon className="h-3.5 w-3.5 text-slate-400" />}
              <span className="max-w-[10rem] truncate">{it.name}</span>
              <button type="button" onClick={() => removeItem(i)} className="text-slate-400 hover:text-red-600">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      {addingLink ? (
        <div className="flex gap-1.5">
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Nombre" className="w-32 flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <button type="button" disabled={!linkName.trim() || !linkUrl.trim()} onClick={addLink} className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-sm text-white disabled:opacity-50">
            OK
          </button>
          <button type="button" onClick={() => setAddingLink(false)} className="flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-500">
            ✕
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:border-slate-400">
            {uploading ? "Subiendo…" : "+ Archivo"}
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
          </label>
          <button type="button" onClick={() => setAddingLink(true)} className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:border-slate-400">
            + Link
          </button>
          <button
            type="button"
            disabled={isPending || items.length === 0}
            onClick={handleSubmit}
            className="ml-auto flex-shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ActiveRound({ round, userId, canEdit }: { round: Round; userId: string | null; canEdit: boolean }) {
  const isFirstRound = round.roundNumber === 1;
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">
          Ronda {round.roundNumber} — enviada por {round.submittedByName} · esperando al cliente
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <FileChips files={round.deliverables} />
          {canEdit && <AddDeliverableForm reviewRoundId={round.id} />}
        </div>
      </div>

      <ItemList items={round.items} canEdit={canEdit} />

      {canEdit && isFirstRound && <AddItemForm reviewRoundId={round.id} />}

      <Chat round={round} userId={userId} canComment={canEdit} />
    </div>
  );
}

function ItemList({ items, canEdit = false, readOnly = false }: { items: Item[]; canEdit?: boolean; readOnly?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-slate-400">Sin características todavía.</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} canEdit={!readOnly && canEdit} />
      ))}
    </ul>
  );
}

function ItemRow({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  usePasteImage(inputRef);
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  // Solo se puede agregar/quitar evidencia mientras el cliente no calificó
  // esta característica — una vez decidida, queda fija.
  const canAttachEvidence = canEdit && !item.result;

  function handleRemove() {
    startTransition(async () => {
      await removeAcceptanceItem(item.id);
      router.refresh();
    });
  }

  async function handleAddEvidenceLink() {
    if (!linkName.trim() || !linkUrl.trim()) return;
    const result = await addAcceptanceItemEvidenceLink(item.id, linkUrl.trim(), linkName.trim());
    if (result.ok) {
      setLinkName("");
      setLinkUrl("");
      setAddingLink(false);
      router.refresh();
    }
  }

  async function uploadEvidence(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const body = await res.json();
      if (res.ok) {
        await addAcceptanceItemEvidence(item.id, body);
        router.refresh();
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemoveEvidence(evidenceId: string) {
    await removeAcceptanceItemEvidence(evidenceId);
    router.refresh();
  }

  return (
    <li className="space-y-1.5 rounded-lg border border-slate-100 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium text-slate-800">{item.title}</p>
            {item.category && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{item.category}</span>}
          </div>
          {item.criteria && (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-500">
              {item.criteria.split("\n").filter((l) => l.trim()).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </div>
        {item.result ? (
          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_COLOR[item.result]}`}>{RESULT_LABEL[item.result]}</span>
        ) : (
          canEdit && (
            <button type="button" onClick={handleRemove} disabled={isPending} className="flex-shrink-0 text-xs text-slate-400 hover:text-red-600">
              Quitar
            </button>
          )
        )}
      </div>

      {!item.result && <p className="text-[11px] text-slate-400">Pendiente de aceptación del cliente.</p>}
      {item.result && item.note && <p className="text-xs text-slate-500">Nota del cliente: {item.note}</p>}
      {item.result && item.reviewedByExternalName && (
        <p className="text-[10px] text-slate-400">
          {item.reviewedByExternalName}
          {item.reviewedByExternalRole && ` · ${item.reviewedByExternalRole}`}
        </p>
      )}

      {item.evidence.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <FileChips files={item.evidence} onRemove={canAttachEvidence ? handleRemoveEvidence : undefined} />
        </div>
      )}
      {canAttachEvidence && !addingLink && (
        <div className="flex items-center gap-2">
          <label className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 hover:underline">
            {uploading ? "Subiendo…" : "+ Evidencia"}
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && uploadEvidence(e.target.files[0])} />
          </label>
          <button type="button" onClick={() => setAddingLink(true)} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
            + Link
          </button>
        </div>
      )}
      {canAttachEvidence && addingLink && (
        <div className="flex gap-1">
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
          <input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Nombre" className="w-24 flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
          <button type="button" disabled={!linkName.trim() || !linkUrl.trim()} onClick={handleAddEvidenceLink} className="flex-shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50">
            OK
          </button>
          <button type="button" onClick={() => setAddingLink(false)} className="flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500">
            ✕
          </button>
        </div>
      )}
    </li>
  );
}

function AddDeliverableForm({ reviewRoundId }: { reviewRoundId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  usePasteImage(inputRef);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAddLink() {
    if (!name.trim() || !url.trim()) return;
    startTransition(async () => {
      await addAcceptanceDeliverableLink(reviewRoundId, url, name);
      setName("");
      setUrl("");
      setOpen(false);
      router.refresh();
    });
  }

  async function uploadFile(file: File) {
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const body = await res.json();
      if (res.ok) {
        await addAcceptanceDeliverable(reviewRoundId, body);
        router.refresh();
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <label className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 hover:underline">
          + Archivo
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
        </label>
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
          + Link
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="w-28 flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
      <button type="button" disabled={isPending || !name.trim() || !url.trim()} onClick={handleAddLink} className="flex-shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50">
        OK
      </button>
      <button type="button" onClick={() => setOpen(false)} className="flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500">
        ✕
      </button>
    </div>
  );
}

function AddItemForm({ reviewRoundId }: { reviewRoundId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [criteria, setCriteria] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!title.trim()) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("category", category);
      formData.set("criteria", criteria);
      const result = await addAcceptanceItem(reviewRoundId, formData);
      if (result.ok) {
        setTitle("");
        setCategory("");
        setCriteria("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva característica o funcionalidad…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Categoría" className="w-32 flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
        <button
          type="button"
          disabled={isPending || !title.trim()}
          onClick={handleAdd}
          className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
      <textarea
        value={criteria}
        onChange={(e) => setCriteria(e.target.value)}
        placeholder="Descripción / puntos específicos, uno por línea (opcional)…"
        rows={2}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs min-h-24"
      />
    </div>
  );
}

function Chat({ round, userId, canComment }: { round: Round; userId: string | null; canComment: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    if (!body.trim()) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("body", body);
      const result = await addAcceptanceMessage(round.id, formData);
      if (result.ok) {
        setBody("");
        router.refresh();
      }
    });
  }

  function handleSaveEdit(messageId: string) {
    startTransition(async () => {
      await editAcceptanceMessage(messageId, editBody);
      setEditingId(null);
      router.refresh();
    });
  }

  if (round.messages.length === 0 && !canComment) return null;

  return (
    <div className="space-y-2 border-t border-slate-100 pt-2">
      <p className="text-xs font-medium text-slate-500">Notas internas del equipo (el cliente no las ve)</p>
      <ul className="space-y-1.5">
        {round.messages.map((m) => (
          <li key={m.id} className="text-sm">
            <span className="font-medium text-slate-700">{m.authorName}:</span>{" "}
            {editingId === m.id ? (
              <span className="inline-flex items-center gap-1">
                <input value={editBody} onChange={(e) => setEditBody(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-0.5 text-xs" />
                <button type="button" onClick={() => handleSaveEdit(m.id)} className="text-xs text-slate-900 hover:underline">
                  Guardar
                </button>
              </span>
            ) : (
              <>
                <span className="text-slate-600">{m.body}</span>
                {m.editedAt && <span className="ml-1 text-[10px] text-slate-400">(editado)</span>}
                {m.authorId === userId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(m.id);
                      setEditBody(m.body);
                    }}
                    className="ml-1.5 text-[10px] text-slate-400 hover:underline"
                  >
                    Editar
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {canComment && (
        <div className="flex gap-1.5">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Escribir una nota…"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={isPending || !body.trim()}
            onClick={handleSend}
            className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      )}
    </div>
  );
}
