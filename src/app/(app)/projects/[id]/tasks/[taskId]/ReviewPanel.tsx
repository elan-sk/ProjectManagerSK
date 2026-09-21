"use client";

import { Linkify } from "@/lib/linkify";
import { usePasteImage } from "@/lib/usePasteImage";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalTrigger } from "@/components/Modal";
import { AvatarGroup } from "@/components/Avatar";
import { useConfirm } from "@/components/Confirm";
import { DocumentIcon, LinkIcon } from "@/components/icons";
import { LINK_MIME_TYPE } from "@/lib/attachments";
import { AttachmentPreviewModal, isPreviewable } from "@/components/AttachmentPreviewModal";
import { AttachmentLightbox } from "./AttachmentLightbox";
import { RoundThread, type RoundMessage } from "./RoundThread";
import { CheckThread } from "./CheckThread";
import { ReassignAssigneesForm } from "./ReassignAssigneesForm";
import {
  setTaskReviewers,
  submitReviewRound,
  addReviewDeliverable,
  addReviewDeliverableLink,
  applyTestTemplate,
  addReviewCheck,
  removeReviewCheck,
  setReviewCheckResult,
  revertReviewCheckResult,
  setCheckResponseCategory,
  addReviewCheckEvidence,
  addReviewCheckEvidenceLink,
  removeReviewCheckEvidence,
  closeReviewRound,
  completeReviewTask,
} from "./reviewActions";
import type { CheckResult, TaskStatus } from "@prisma/client";

type FileRef = { id: string; url: string; name: string; mimeType: string };
type Check = {
  id: string;
  title: string;
  criteria: string | null;
  category: string | null;
  result: CheckResult | null;
  note: string | null;
  responseCategory: string | null;
  reviewedByName: string | null;
  evidence: FileRef[];
};
type Round = {
  id: string;
  roundNumber: number;
  submittedByName: string;
  submittedAt: string;
  outcome: "APPROVED" | "RETURNED" | null;
  deliverables: FileRef[];
  checks: Check[];
  messages: RoundMessage[];
};

const RESULT_LABEL: Record<CheckResult, string> = {
  APPROVED: "Aprobada",
  FLAGGED: "Con hallazgos",
  FAILED: "Con errores",
  NOT_APPLICABLE: "No aplica",
};
const RESULT_COLOR: Record<CheckResult, string> = {
  APPROVED: "bg-emerald-600 text-white",
  FLAGGED: "bg-amber-500 text-white",
  FAILED: "bg-red-600 text-white",
  NOT_APPLICABLE: "bg-slate-400 text-white",
};
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
  // Punto 2: si hay preview disponible (imagen o doc previsualizable), el
  // chip abre el mismo visor que ya usan Insumos/Evidencias de la tarea en
  // vez de descargar directo — para lo no previsualizable, se mantiene el
  // link de siempre.
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

// Agrupa un conjunto de chips (deliverables de una ronda, o evidencia de un
// check) y reusa el mismo visor de imágenes/documentos que Insumos y
// Evidencias de la tarea (AttachmentLightbox / AttachmentPreviewModal) — sin
// tocar esos componentes, en modo solo-lectura (canDelete=false / sin
// onDelete) ya que el borrado de evidencia acá tiene su propio botón ✕.
function FileChips({ files, onRemove }: { files: FileRef[]; onRemove?: (id: string) => void }) {
  const [openImageId, setOpenImageId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<FileRef | null>(null);
  const images = files.filter((f) => f.mimeType.startsWith("image/"));

  return (
    <>
      {files.map((file) => {
        const isImage = file.mimeType.startsWith("image/");
        const onClick = isImage
          ? () => setOpenImageId(file.id)
          : isPreviewable(file.mimeType)
            ? () => setPreviewDoc(file)
            : undefined;
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
      {openImageId && (
        <AttachmentLightbox images={images} openId={openImageId} onClose={() => setOpenImageId(null)} onNavigate={setOpenImageId} canDelete={false} />
      )}
      {previewDoc && <AttachmentPreviewModal file={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </>
  );
}

export function ReviewPanel({
  taskId,
  userId,
  canManage,
  canEdit,
  canReview,
  users,
  currentReviewerIds,
  templates,
  responseCategories,
  rounds,
  taskStatus,
}: {
  taskId: string;
  userId: string | null;
  canManage: boolean;
  canEdit: boolean;
  canReview: boolean;
  users: { id: string; name: string; avatarUrl: string | null }[];
  currentReviewerIds: string[];
  templates: { id: string; name: string }[];
  responseCategories: { name: string; responses: string[] }[];
  rounds: Round[];
  // Punto 16: una vez COMPLETED, no se puede reenviar ni completar de
  // nuevo — la evidencia sigue siendo visible/descargable más abajo (ver
  // closedRounds), pero ya nada acá permite subir algo nuevo.
  taskStatus: TaskStatus;
}) {
  const activeRound = rounds.find((r) => r.outcome === null) ?? null;
  const closedRounds = rounds.filter((r) => r.outcome !== null);
  // `rounds` llega ordenado desc por roundNumber (ver page.tsx) — el primero
  // es siempre el más reciente, cerrado o no.
  const lastRound = rounds[0] ?? null;
  const reviewers = users.filter((u) => currentReviewerIds.includes(u.id));
  const isDone = taskStatus === "COMPLETED";

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[21px] font-semibold text-slate-900">Prueba</h2>
        <div className="flex items-center gap-2">
          <span className="text-[17px] text-slate-400">Revisores:</span>
          <AvatarGroup people={reviewers.map((r) => ({ name: r.name, avatarUrl: r.avatarUrl }))} />
          {canManage && !isDone && (
            <ModalTrigger label="Cambiar" title="Asignar revisores" variant="secondary" compact>
              <ReassignAssigneesForm
                taskId={taskId}
                currentAssigneeIds={currentReviewerIds}
                users={users}
                action={setTaskReviewers}
                fieldName="reviewerIds"
                errorFallback="No se pudo actualizar los revisores."
              />
            </ModalTrigger>
          )}
        </div>
      </div>

      {activeRound ? (
        <ActiveRound
          round={activeRound}
          userId={userId}
          canReview={canReview}
          canEdit={canEdit}
          templates={templates}
          responseCategories={responseCategories}
        />
      ) : (
        !isDone && (
          <>
            {/* Punto 8: si la última ronda quedó devuelta, antes de poder
                reenviar el asignado tiene que responder + mandar evidencia
                de la corrección de cada prueba que falló. */}
            {canEdit && lastRound?.outcome === "RETURNED" && (
              <CorrectionPanel round={lastRound} responseCategories={responseCategories} />
            )}
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

      {/* Punto 15: solo el revisor (o PM/admin) finaliza la Prueba, con un
          botón dedicado acá — no desde el control de estado genérico. */}
      {canReview && !isDone && !activeRound && lastRound?.outcome === "APPROVED" && (
        <CompleteTaskButton taskId={taskId} />
      )}

      {closedRounds.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-[18px] font-semibold text-slate-600">Rondas anteriores</p>
          {closedRounds.map((round) => (
            <details key={round.id} className="rounded-lg border border-slate-100 p-2 text-[18px]">
              <summary className="cursor-pointer text-slate-600">
                Ronda {round.roundNumber} —{" "}
                <span className={round.outcome === "APPROVED" ? "text-emerald-600" : "text-orange-600"}>
                  {round.outcome === "APPROVED" ? "Aprobada" : "Devuelta"}
                </span>{" "}
                · enviada por {round.submittedByName}
              </summary>
              <div className="mt-2 space-y-2 pl-2">
                <RoundChecks checks={round.checks} readOnly />
                <RoundThread roundId={round.id} messages={round.messages} userId={userId} canComment={canEdit || canReview} canVote={canEdit || canReview} canClose={canEdit} canAttach={false} />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

// Punto 8: pruebas "Con errores" de la última ronda devuelta, editables SOLO
// para responder (categoría de respuesta) y adjuntar evidencia de la
// corrección — nunca para volver a calificarlas (eso es del revisor, en la
// ronda siguiente). Reusa RoundChecks/CheckRow sin canReview, así ninguno de
// los controles de revisor (Quitar, calificar) aparece acá.
function CorrectionPanel({ round, responseCategories }: { round: Round; responseCategories: { name: string; responses: string[] }[] }) {
  const failedChecks = round.checks.filter((c) => c.result === "FAILED");
  if (failedChecks.length === 0) return null;
  const allAnswered = failedChecks.every((c) => c.responseCategory?.trim() && c.evidence.length > 0);
  return (
    <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/60 p-3">
      <p className="text-[18px] font-medium text-orange-800">
        Antes de reenviar — respondé y subí evidencia de la corrección de cada prueba con error (ronda {round.roundNumber})
      </p>
      <RoundChecks checks={failedChecks} canEdit responseCategories={responseCategories} />
      {!allAnswered && <p className="text-[17px] text-orange-600">Faltan pruebas por responder con evidencia.</p>}
    </div>
  );
}

function CompleteTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleClick() {
    const ok = await confirm(
      "Una vez que la marques como completada, no vas a poder subir más evidencia para esta tarea. ¿Querés continuar?",
      { confirmLabel: "Sí, completar" }
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await completeReviewTask(taskId);
      if (result.ok) router.refresh();
      else setError(result.error ?? "No se pudo completar la tarea.");
    });
  }

  return (
    <div className="space-y-1 border-t border-slate-100 pt-3">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[18px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        Completar tarea
      </button>
      {error && <p className="text-[17px] text-red-600">{error}</p>}
    </div>
  );
}

// Punto 7: el envío/reenvío admite CUALQUIER combinación de links y archivos
// (uno o varios de cada tipo) — antes solo aceptaba un único link.
// Punto 3b: al reenviar (ronda 2+), `initialItems` trae lo entregado en la
// ronda anterior — para el asignado se ve prellenado, pero cada ítem
// conserva su `id` original así el servidor reasigna esa misma fila a la
// ronda nueva en vez de duplicarla (ver submitReviewRound).
function SubmitRoundForm({
  taskId,
  nextRoundNumber,
  initialItems = [],
}: {
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
      const result = await submitReviewRound(taskId, items);
      if (result.ok) {
        setItems([]);
        router.refresh();
      } else setError(result.error ?? "No se pudo enviar a revisión.");
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
      <p className="text-[18px] text-slate-600">
        {nextRoundNumber === 1 ? "Enviar a revisión" : `Reenviar (ronda ${nextRoundNumber})`}
      </p>
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

function ActiveRound({ round, userId, canReview, canEdit, templates, responseCategories }: {
  round: Round;
  userId: string | null;
  canReview: boolean;
  canEdit: boolean;
  templates: { id: string; name: string }[];
  responseCategories: { name: string; responses: string[] }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Punto 8: la gestión completa de plantilla (aplicar/agregar puntos nuevos)
  // solo tiene sentido en la ronda 1 — de ahí en más, la ronda nace ya con
  // las mismas pruebas que fallaron (misma prueba, otra ronda), el revisor
  // no arma una revisión nueva de cero.
  const isFirstRound = round.roundNumber === 1;

  function handleApplyTemplate(templateId: string) {
    if (!templateId) return;
    startTransition(async () => {
      const result = await applyTestTemplate(round.id, templateId);
      if (result.ok) router.refresh();
      else setError(result.error ?? null);
    });
  }

  function handleClose() {
    startTransition(async () => {
      const result = await closeReviewRound(round.id);
      if (result.ok) router.refresh();
      else setError(result.error ?? null);
    });
  }

  const allResolved = round.checks.length > 0 && round.checks.every((c) => c.result);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[19px] font-semibold text-slate-800">
          Ronda {round.roundNumber} — enviada por {round.submittedByName}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <FileChips files={round.deliverables} />
          {canEdit && <AddDeliverableForm reviewRoundId={round.id} />}
        </div>
      </div>

      {canReview && isFirstRound && templates.length > 0 && (
        <select
          onChange={(e) => handleApplyTemplate(e.target.value)}
          defaultValue=""
          disabled={isPending}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px] text-slate-600"
        >
          <option value="" disabled>
            Usar una plantilla de pruebas…
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      <RoundChecks checks={round.checks} canReview={canReview} canEdit={canEdit} responseCategories={responseCategories} />

      {canReview && isFirstRound && <AddCheckForm reviewRoundId={round.id} />}

      {canReview && (
        <div>
          <button
            type="button"
            disabled={isPending || !allResolved}
            onClick={handleClose}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-[18px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Cerrar ronda
          </button>
          {!allResolved && round.checks.length > 0 && <p className="mt-1 text-[17px] text-slate-400">Faltan pruebas por resolver.</p>}
        </div>
      )}
      {error && <p className="text-[17px] text-red-600">{error}</p>}

      <RoundThread roundId={round.id} messages={round.messages} userId={userId} canComment={canEdit || canReview} canVote={canEdit || canReview} canClose={canEdit} canAttach />
    </div>
  );
}

function RoundChecks({ checks, canReview = false, canEdit = false, readOnly = false, responseCategories = [] }: {
  checks: Check[];
  canReview?: boolean;
  canEdit?: boolean;
  readOnly?: boolean;
  responseCategories?: { name: string; responses: string[] }[];
}) {
  if (checks.length === 0) return <p className="text-[18px] text-slate-400">Sin pruebas todavía.</p>;
  return (
    <ul className="space-y-5">
      {checks.map((check, index) => (
        <CheckRow
          key={check.id}
          index={index}
          total={checks.length}
          check={check}
          canReview={!readOnly && canReview}
          canEdit={!readOnly && canEdit}
          responseCategories={responseCategories}
        />
      ))}
    </ul>
  );
}

function CheckRow({ index, total, check, canReview, canEdit, responseCategories }: {
  index: number;
  total: number;
  check: Check;
  canReview: boolean;
  canEdit: boolean;
  responseCategories: { name: string; responses: string[] }[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [note, setNote] = useState(check.note ?? "");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  usePasteImage(inputRef);
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  // Punto 8: quien corrige (canEdit) también puede adjuntar evidencia de su
  // corrección sobre una prueba que ya quedó "Con errores" — antes esto era
  // exclusivo del revisor.
  const canAttachEvidence = canReview || (canEdit && check.result === "FAILED");

  function setResult(result: CheckResult) {
    startTransition(async () => {
      await setReviewCheckResult(check.id, result, note);
      router.refresh();
    });
  }

  // Punto 4: revertir vuelve el resultado a blanco mientras la ronda siga
  // abierta (acá `canReview` ya viene en false en modo readOnly/ronda
  // cerrada — ver RoundChecks) para que el revisor la vuelva a calificar.
  async function handleRevert() {
    const ok = await confirm("¿Revertir la calificación de esta prueba? Vas a tener que volver a calificarla.", {
      confirmLabel: "Sí, revertir",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await revertReviewCheckResult(check.id);
      if (result.ok) router.refresh();
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await removeReviewCheck(check.id);
      router.refresh();
    });
  }

  async function handleAddEvidenceLink() {
    if (!linkName.trim() || !linkUrl.trim()) return;
    const result = await addReviewCheckEvidenceLink(check.id, linkUrl.trim(), linkName.trim());
    if (result.ok) {
      setLinkName("");
      setLinkUrl("");
      setAddingLink(false);
      router.refresh();
    }
  }

  function handleResponseCategory(category: string) {
    startTransition(async () => {
      await setCheckResponseCategory(check.id, category);
      router.refresh();
    });
  }

  async function uploadEvidence(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const body = await res.json();
      if (res.ok) {
        await addReviewCheckEvidence(check.id, body);
        router.refresh();
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemoveEvidence(evidenceId: string) {
    await removeReviewCheckEvidence(evidenceId);
    router.refresh();
  }

  // Punto 10 confirmado con el usuario: la plantilla de respuestas de
  // Configuración > Pruebas conviven con el texto libre, nunca lo
  // reemplazan — un <datalist> nativo alcanza: sugiere sin obligar. Se
  // busca por el nombre de categoría de la prueba (viene de la plantilla de
  // pruebas) y, si no hay una categoría con ese nombre exacto, cae a "Otro".
  const matchingResponses =
    responseCategories.find((c) => c.name.toLowerCase() === (check.category ?? "").trim().toLowerCase())?.responses ??
    responseCategories.find((c) => c.name.toLowerCase() === "otro")?.responses ??
    [];

  return (
    <li className="space-y-1.5 rounded-xl border border-slate-300 border-l-4 border-l-[#0a6b78] bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[#0a6b78]">Prueba {index + 1} de {total}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[19px] font-semibold text-slate-800"><Linkify text={check.title} /></p>
            {check.category && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[13px] text-slate-500">{check.category}</span>}
          </div>
          {check.criteria && (
            <ul className="list-disc space-y-0.5 pl-4 text-[17px] text-slate-500">
              {check.criteria.split("\n").filter((line) => line.trim()).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        {check.result ? (
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_COLOR[check.result]}`}>{RESULT_LABEL[check.result]}</span>
            {/* Punto 4: revertir solo mientras la ronda siga abierta — en modo
                readOnly (ronda cerrada) CheckRow ya recibe canReview=false. */}
            {canReview && (
              <button type="button" onClick={handleRevert} disabled={isPending} className="text-[17px] text-slate-400 hover:text-red-600">
                Revertir
              </button>
            )}
          </div>
        ) : (
          canReview && (
            <button type="button" onClick={handleRemove} disabled={isPending} className="flex-shrink-0 text-[17px] text-slate-400 hover:text-red-600">
              Quitar
            </button>
          )
        )}
      </div>

      {canReview && !check.result && (
        <div className="space-y-1.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota (opcional)…"
            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[17px]"
          />
          <div className="flex flex-wrap gap-1.5">
            {/* Punto 6: calificar con error o con hallazgo exige evidencia ya
                cargada — deshabilitado desde el primer render (punto 5), no
                después de intentarlo. */}
            {(["APPROVED", "FLAGGED", "FAILED", "NOT_APPLICABLE"] as const).map((r) => {
              const needsEvidence = (r === "FAILED" || r === "FLAGGED") && check.evidence.length === 0;
              return (
                <button
                  key={r}
                  type="button"
                  disabled={isPending || needsEvidence}
                  title={needsEvidence ? "Subí evidencia antes de calificar con error o con hallazgo." : undefined}
                  onClick={() => setResult(r)}
                  className={`rounded-lg px-2 py-1 text-[17px] font-medium ${RESULT_COLOR[r]} disabled:opacity-50`}
                >
                  {RESULT_LABEL[r]}
                </button>
              );
            })}
          </div>
          {check.evidence.length === 0 && (
            <p className="text-[15px] text-slate-400">Para calificar con error o con hallazgo, subí evidencia primero.</p>
          )}
        </div>
      )}

      {check.result && check.note && <p className="text-[17px] text-slate-500">Nota: <Linkify text={check.note} /></p>}

      {check.evidence.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <FileChips files={check.evidence} onRemove={canAttachEvidence ? handleRemoveEvidence : undefined} />
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

      {check.result === "FAILED" && canEdit && (
        <>
          <input
            list={matchingResponses.length > 0 ? `responses-${check.id}` : undefined}
            defaultValue={check.responseCategory ?? ""}
            onBlur={(e) => e.target.value !== (check.responseCategory ?? "") && handleResponseCategory(e.target.value)}
            placeholder="Categoría de tu corrección (ej. Error de lógica)…"
            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[17px]"
          />
          {matchingResponses.length > 0 && (
            <datalist id={`responses-${check.id}`}>
              {matchingResponses.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          )}
        </>
      )}
      {check.result === "FAILED" && check.responseCategory && !canEdit && (
        <p className="text-[17px] text-slate-500">Respuesta: {check.responseCategory}</p>
      )}

      {check.reviewedByName && <p className="text-[13px] text-slate-400">Revisado por {check.reviewedByName}</p>}

      <CheckThread checkId={check.id} title={check.title} />
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
      await addReviewDeliverableLink(reviewRoundId, url, name);
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
        await addReviewDeliverable(reviewRoundId, body);
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

// Punto 13: ahora también junta `criteria` (los puntos concretos de la
// prueba, uno por línea) — antes no había forma de agregarlos al crear una
// prueba a mano, solo llegaban copiados de una plantilla.
function AddCheckForm({ reviewRoundId }: { reviewRoundId: string }) {
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
      const result = await addReviewCheck(reviewRoundId, formData);
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
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva prueba…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px]" />
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
        placeholder="Puntos específicos, uno por línea (opcional)…"
        rows={2}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px] min-h-24"
      />
    </div>
  );
}
