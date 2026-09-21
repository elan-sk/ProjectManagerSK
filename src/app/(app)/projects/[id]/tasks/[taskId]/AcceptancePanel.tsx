"use client";

import { Linkify, LinkifyBold } from "@/lib/linkify";
import { usePasteImage } from "@/lib/usePasteImage";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/Confirm";
import { DocumentIcon, LinkIcon } from "@/components/icons";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { AttachmentPreviewModal, isPreviewable } from "@/components/AttachmentPreviewModal";
import { AttachmentLightbox } from "./AttachmentLightbox";
import { RoundThread, type RoundMessage } from "./RoundThread";
import { TeamShareThread, type TeamThreadComment } from "./TeamShareThread";
import {
  submitAcceptanceRound,
  addAcceptanceDeliverable,
  addAcceptanceDeliverableLink,
  removeAcceptanceDeliverable,
  addAcceptanceItem,
  removeAcceptanceItem,
  updateAcceptanceItem,
  addAcceptanceItemEvidence,
  addAcceptanceItemEvidenceLink,
  removeAcceptanceItemEvidence,
  completeAcceptanceTask,
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
  /** Hilo del link compartido sobre esta característica (cliente y equipo). */
  comments: TeamThreadComment[];
};
type Round = {
  id: string;
  roundNumber: number;
  submittedByName: string;
  submittedAt: string;
  outcome: "APPROVED" | "RETURNED" | null;
  deliverables: FileRef[];
  items: Item[];
  messages: RoundMessage[];
};

const RESULT_LABEL: Record<"APPROVED" | "FAILED", string> = { APPROVED: "Aceptada por el cliente", FAILED: "Devuelta por el cliente" };
const RESULT_COLOR: Record<"APPROVED" | "FAILED", string> = { APPROVED: "bg-emerald-600 text-white", FAILED: "bg-red-600 text-white" };
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.html";

function FileChip({ file, onClick }: { file: FileRef; onClick?: () => void }) {
  const isLink = file.mimeType === LINK_MIME_TYPE;
  const className = "flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[17px] text-slate-600 hover:bg-slate-50";
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
                aria-label="Quitar adjunto"
                title="Quitar"
                className="absolute -top-1.5 -right-1.5 rounded-full border border-slate-200 bg-white px-1 text-[12px] leading-4 text-slate-500 shadow-sm hover:text-red-600"
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
export function AcceptancePanel({ taskId, userId, canEdit, canVote, rounds, taskStatus }: {
  taskId: string;
  userId: string | null;
  canEdit: boolean;
  /** Puede responder las preguntas (asignados, revisores, PM y admin). */
  canVote: boolean;
  rounds: Round[];
  taskStatus: TaskStatus;
}) {
  const activeRound = rounds.find((r) => r.outcome === null) ?? null;
  const closedRounds = rounds.filter((r) => r.outcome !== null);
  const lastRound = rounds[0] ?? null;
  const isDone = taskStatus === "COMPLETED";

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-[21px] font-semibold text-slate-900">Aceptación</h2>

      {activeRound ? (
        <ActiveRound taskId={taskId} round={activeRound} userId={userId} canEdit={canEdit} canVote={canVote} />
      ) : (
        !isDone && (
          <>
            {canEdit && lastRound?.outcome === "RETURNED" && <CorrectionPanel taskId={taskId} round={lastRound} canVote={canVote} />}
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
          <p className="text-[18px] font-semibold text-slate-600">Rondas anteriores</p>
          {closedRounds.map((round) => (
            <details key={round.id} className="rounded-lg border border-slate-100 p-2 text-[18px]">
              <summary className="cursor-pointer text-slate-600">
                Ronda {round.roundNumber} —{" "}
                <span className={round.outcome === "APPROVED" ? "text-emerald-600" : "text-orange-600"}>
                  {round.outcome === "APPROVED" ? "Aceptada" : "Devuelta"}
                </span>{" "}
                · enviada por {round.submittedByName}
              </summary>
              <div className="mt-2 space-y-2 pl-2">
                <ItemList taskId={taskId} items={round.items} canVote={canVote} readOnly />
                <RoundThread roundId={round.id} messages={round.messages} userId={userId} canComment={canEdit} canVote={canVote} canClose={canEdit} canAttach={false} />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function CorrectionPanel({ taskId, round, canVote }: { taskId: string; round: Round; canVote: boolean }) {
  const returnedItems = round.items.filter((i) => i.result === "FAILED");
  if (returnedItems.length === 0) return null;
  const allWithEvidence = returnedItems.every((i) => i.evidence.length > 0);
  return (
    <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/60 p-3">
      <p className="text-[18px] font-medium text-orange-800">
        El cliente devolvió {returnedItems.length} característica(s) — subí evidencia de la corrección antes de reenviar (ronda {round.roundNumber})
      </p>
      <ItemList taskId={taskId} items={returnedItems} canEdit canVote={canVote} />
      {!allWithEvidence && <p className="text-[17px] text-orange-600">Faltan características por corregir con evidencia.</p>}
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
      <button type="button" disabled={isPending} onClick={handleClick} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[18px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        Completar tarea
      </button>
      {error && <p className="text-[17px] text-red-600">{error}</p>}
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
      <p className="text-[18px] text-slate-600">{nextRoundNumber === 1 ? "Enviar a aceptación del cliente" : `Reenviar (ronda ${nextRoundNumber})`}</p>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span key={i} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[17px] text-slate-600">
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
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[18px]" />
          <input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Nombre" className="w-32 flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[18px]" />
          <button type="button" disabled={!linkName.trim() || !linkUrl.trim()} onClick={addLink} className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[18px] text-white disabled:opacity-50">
            OK
          </button>
          <button type="button" onClick={() => setAddingLink(false)} className="flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[18px] text-slate-500">
            ✕
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[18px] text-slate-500 hover:border-slate-400">
            {uploading ? "Subiendo…" : "+ Archivo"}
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
          </label>
          <button type="button" onClick={() => setAddingLink(true)} className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[18px] text-slate-500 hover:border-slate-400">
            + Link
          </button>
          <button
            type="button"
            disabled={isPending || items.length === 0}
            onClick={handleSubmit}
            className="ml-auto flex-shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-[18px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      )}
      {error && <p className="text-[17px] text-red-600">{error}</p>}
    </div>
  );
}

function ActiveRound({ taskId, round, userId, canEdit, canVote }: { taskId: string; round: Round; userId: string | null; canEdit: boolean; canVote: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const isFirstRound = round.roundNumber === 1;

  async function handleRemoveDeliverable(id: string) {
    if (!(await confirm("¿Quitar este adjunto de la ronda?", { confirmLabel: "Sí, quitar" }))) return;
    await removeAcceptanceDeliverable(id);
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[19px] font-semibold text-slate-800">
          Ronda {round.roundNumber} — enviada por {round.submittedByName} · esperando al cliente
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <FileChips files={round.deliverables} onRemove={canEdit ? handleRemoveDeliverable : undefined} />
          {canEdit && <AddDeliverableForm reviewRoundId={round.id} />}
        </div>
      </div>

      <ItemList taskId={taskId} items={round.items} canEdit={canEdit} canVote={canVote} />

      {canEdit && isFirstRound && <AddItemForm reviewRoundId={round.id} />}

      <RoundThread roundId={round.id} messages={round.messages} userId={userId} canComment={canEdit} canVote={canVote} canClose={canEdit} canAttach />
    </div>
  );
}

function ItemList({ taskId, items, canEdit = false, canVote = false, readOnly = false }: { taskId: string; items: Item[]; canEdit?: boolean; canVote?: boolean; readOnly?: boolean }) {
  if (items.length === 0) return <p className="text-[18px] text-slate-400">Sin características todavía.</p>;
  return (
    <ul className="space-y-5">
      {items.map((item, index) => (
        <ItemRow key={item.id} index={index} total={items.length} taskId={taskId} item={item} canEdit={!readOnly && canEdit} canVote={canVote} />
      ))}
    </ul>
  );
}

function ItemRow({ index, total, taskId, item, canEdit, canVote }: { index: number; total: number; taskId: string; item: Item; canEdit: boolean; canVote: boolean }) {
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
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftCriteria, setDraftCriteria] = useState(item.criteria ?? "");
  const [draftCategory, setDraftCategory] = useState(item.category ?? "");
  const [editError, setEditError] = useState<string | null>(null);

  function startEditing() {
    setDraftTitle(item.title);
    setDraftCriteria(item.criteria ?? "");
    setDraftCategory(item.category ?? "");
    setEditError(null);
    setEditing(true);
  }

  function handleSaveEdit() {
    startTransition(async () => {
      const result = await updateAcceptanceItem(item.id, { title: draftTitle, criteria: draftCriteria, category: draftCategory });
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setEditError(result.error);
      }
    });
  }

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
    <li className={`space-y-1.5 rounded-xl border border-l-4 p-3 shadow-sm ${item.result === "FAILED" ? "border-amber-400 border-l-amber-500 bg-amber-50" : "border-slate-300 border-l-[#0a6b78] bg-white"}`}>
      <p className="text-[13px] font-semibold uppercase tracking-wide text-[#0a6b78]">Característica {index + 1} de {total}</p>
      {item.result === "FAILED" && (
        <p className="rounded-lg bg-amber-100 px-3 py-1.5 text-[15px] font-semibold text-amber-900">
          ⚠ El cliente devolvió esta característica{item.reviewedByExternalName ? ` · ${item.reviewedByExternalName}` : ""}
        </p>
      )}
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex gap-1.5">
              <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} aria-label="Título de la característica" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px]" />
              <input value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)} placeholder="Categoría" aria-label="Categoría" className="w-32 flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px]" />
            </div>
            <textarea
              value={draftCriteria}
              onChange={(e) => setDraftCriteria(e.target.value)}
              placeholder="Puntos específicos a verificar, uno por línea (opcional)…"
              aria-label="Descripción y puntos a verificar"
              rows={5}
              className="min-h-24 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px]"
            />
            {editError && <p className="text-[15px] text-red-600">{editError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={handleSaveEdit} disabled={isPending || !draftTitle.trim()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[17px] font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {isPending ? "Guardando…" : "Guardar cambios"}
              </button>
              <button type="button" onClick={() => setEditing(false)} disabled={isPending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[17px] font-medium text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[19px] font-semibold text-slate-800"><Linkify text={item.title} /></p>
            {item.category && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[13px] text-slate-500">{item.category}</span>}
          </div>
          {item.criteria && (
            <ul className="list-disc space-y-0.5 pl-4 text-[17px] text-slate-500">
              {item.criteria.split("\n").filter((l) => l.trim()).map((l, i) => (
                <li key={i}><LinkifyBold text={l} /></li>
              ))}
            </ul>
          )}
        </div>
        )}
        {item.result ? (
          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_COLOR[item.result]}`}>{RESULT_LABEL[item.result]}</span>
        ) : (
          canEdit && !editing && (
            <div className="flex flex-shrink-0 items-center gap-3">
              <button type="button" onClick={startEditing} disabled={isPending} className="text-[17px] text-slate-500 hover:text-slate-900 hover:underline">
                Editar
              </button>
              <button type="button" onClick={handleRemove} disabled={isPending} className="text-[17px] text-slate-400 hover:text-red-600">
                Quitar
              </button>
            </div>
          )
        )}
      </div>

      {!item.result && <p className="text-[15px] text-slate-400">Pendiente de aceptación del cliente.</p>}
      {item.result && item.note && <p className="text-[17px] text-slate-500">Nota del cliente: <Linkify text={item.note} /></p>}
      {item.result && item.reviewedByExternalName && (
        <p className="text-[13px] text-slate-400">
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
          <label className="cursor-pointer text-[17px] text-slate-400 hover:text-slate-600 hover:underline">
            {uploading ? "Subiendo…" : "+ Evidencia"}
            <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && uploadEvidence(e.target.files[0])} />
          </label>
          <button type="button" onClick={() => setAddingLink(true)} className="text-[17px] text-slate-400 hover:text-slate-600 hover:underline">
            + Link
          </button>
        </div>
      )}
      {canAttachEvidence && addingLink && (
        <div className="flex gap-1">
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-[17px]" />
          <input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Nombre" className="w-24 flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[17px]" />
          <button type="button" disabled={!linkName.trim() || !linkUrl.trim()} onClick={handleAddEvidenceLink} className="flex-shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-[17px] text-white disabled:opacity-50">
            OK
          </button>
          <button type="button" onClick={() => setAddingLink(false)} className="flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[17px] text-slate-500">
            ✕
          </button>
        </div>
      )}
      {(item.comments.length > 0 || canEdit) && (
        <TeamShareThread taskId={taskId} reviewCheckId={item.id} contextLabel={`Característica ${index + 1}`} comments={item.comments} canReply={canEdit} canVote={canVote} canAttach />
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
        <label className="cursor-pointer text-[17px] text-slate-400 hover:text-slate-600 hover:underline">
          + Archivo
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
        </label>
        <button type="button" onClick={() => setOpen(true)} className="text-[17px] text-slate-400 hover:text-slate-600 hover:underline">
          + Link
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-[17px]" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="w-28 flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[17px]" />
      <button type="button" disabled={isPending || !name.trim() || !url.trim()} onClick={handleAddLink} className="flex-shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-[17px] text-white disabled:opacity-50">
        OK
      </button>
      <button type="button" onClick={() => setOpen(false)} className="flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[17px] text-slate-500">
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
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva característica o funcionalidad…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px]" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Categoría" className="w-32 flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px]" />
        <button
          type="button"
          disabled={isPending || !title.trim()}
          onClick={handleAdd}
          className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[17px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
      <textarea
        value={criteria}
        onChange={(e) => setCriteria(e.target.value)}
        placeholder="Descripción / puntos específicos, uno por línea (opcional)…"
        rows={2}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px] min-h-24"
      />
    </div>
  );
}
