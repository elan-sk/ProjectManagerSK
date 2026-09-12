"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalTrigger } from "@/components/Modal";
import { AvatarGroup } from "@/components/Avatar";
import { DocumentIcon, LinkIcon } from "@/components/icons";
import { LINK_MIME_TYPE } from "@/lib/attachments";
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
  setCheckResponseCategory,
  addReviewCheckEvidence,
  removeReviewCheckEvidence,
  closeReviewRound,
  addReviewMessage,
  editReviewMessage,
} from "./reviewActions";
import type { CheckResult } from "@prisma/client";

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
type Message = { id: string; authorId: string; authorName: string; body: string; editedAt: string | null; createdAt: string };
type Round = {
  id: string;
  roundNumber: number;
  submittedByName: string;
  submittedAt: string;
  outcome: "APPROVED" | "RETURNED" | null;
  deliverables: FileRef[];
  checks: Check[];
  messages: Message[];
};

const RESULT_LABEL: Record<CheckResult, string> = { APPROVED: "Aprobada", FLAGGED: "Con hallazgos", FAILED: "Con errores" };
const RESULT_COLOR: Record<CheckResult, string> = {
  APPROVED: "bg-emerald-600 text-white",
  FLAGGED: "bg-amber-500 text-white",
  FAILED: "bg-red-600 text-white",
};
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";

function FileChip({ file }: { file: FileRef }) {
  const isLink = file.mimeType === LINK_MIME_TYPE;
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noreferrer"
      download={isLink ? undefined : file.name}
      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
    >
      {isLink ? <LinkIcon className="h-3.5 w-3.5 text-slate-400" /> : <DocumentIcon className="h-3.5 w-3.5 text-slate-400" />}
      <span className="max-w-[10rem] truncate">{file.name}</span>
    </a>
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
}) {
  const activeRound = rounds.find((r) => r.outcome === null) ?? null;
  const closedRounds = rounds.filter((r) => r.outcome !== null);
  const reviewers = users.filter((u) => currentReviewerIds.includes(u.id));

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-slate-900">Prueba</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Revisores:</span>
          <AvatarGroup people={reviewers.map((r) => ({ name: r.name, avatarUrl: r.avatarUrl }))} />
          {canManage && (
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
        canEdit && <SubmitRoundForm taskId={taskId} nextRoundNumber={rounds.length + 1} />
      )}

      {closedRounds.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-500">Rondas anteriores</p>
          {closedRounds.map((round) => (
            <details key={round.id} className="rounded-lg border border-slate-100 p-2 text-sm">
              <summary className="cursor-pointer text-slate-600">
                Ronda {round.roundNumber} —{" "}
                <span className={round.outcome === "APPROVED" ? "text-emerald-600" : "text-orange-600"}>
                  {round.outcome === "APPROVED" ? "Aprobada" : "Devuelta"}
                </span>{" "}
                · enviada por {round.submittedByName}
              </summary>
              <div className="mt-2 space-y-2 pl-2">
                <RoundChecks checks={round.checks} readOnly />
                <Chat round={round} userId={userId} canComment={canEdit || canReview} />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function SubmitRoundForm({ taskId, nextRoundNumber }: { taskId: string; nextRoundNumber: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!name.trim() || !url.trim()) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("name", name);
      formData.set("url", url);
      const result = await submitReviewRound(taskId, formData);
      if (result.ok) router.refresh();
      else setError(result.error ?? "No se pudo enviar a revisión.");
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
      <p className="text-sm text-slate-600">
        {nextRoundNumber === 1 ? "Enviar a revisión" : `Reenviar (ronda ${nextRoundNumber})`}
      </p>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del entregable" className="w-40 flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        <button
          type="button"
          disabled={isPending || !name.trim() || !url.trim()}
          onClick={handleSubmit}
          className="flex-shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
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
        <p className="text-sm font-medium text-slate-800">
          Ronda {round.roundNumber} — enviada por {round.submittedByName}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {round.deliverables.map((d) => (
            <FileChip key={d.id} file={d} />
          ))}
          {canEdit && <AddDeliverableForm reviewRoundId={round.id} />}
        </div>
      </div>

      {canReview && templates.length > 0 && (
        <select
          onChange={(e) => handleApplyTemplate(e.target.value)}
          defaultValue=""
          disabled={isPending}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600"
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

      {canReview && <AddCheckForm reviewRoundId={round.id} />}

      {canReview && (
        <div>
          <button
            type="button"
            disabled={isPending || !allResolved}
            onClick={handleClose}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Cerrar ronda
          </button>
          {!allResolved && round.checks.length > 0 && <p className="mt-1 text-xs text-slate-400">Faltan pruebas por resolver.</p>}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <Chat round={round} userId={userId} canComment={canEdit || canReview} />
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
  if (checks.length === 0) return <p className="text-sm text-slate-400">Sin pruebas todavía.</p>;
  return (
    <ul className="space-y-2">
      {checks.map((check) => (
        <CheckRow
          key={check.id}
          check={check}
          canReview={!readOnly && canReview}
          canEdit={!readOnly && canEdit}
          responseCategories={responseCategories}
        />
      ))}
    </ul>
  );
}

function CheckRow({ check, canReview, canEdit, responseCategories }: {
  check: Check;
  canReview: boolean;
  canEdit: boolean;
  responseCategories: { name: string; responses: string[] }[];
}) {
  const router = useRouter();
  const [note, setNote] = useState(check.note ?? "");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function setResult(result: CheckResult) {
    startTransition(async () => {
      await setReviewCheckResult(check.id, result, note);
      router.refresh();
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await removeReviewCheck(check.id);
      router.refresh();
    });
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
    <li className="space-y-1.5 rounded-lg border border-slate-100 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium text-slate-800">{check.title}</p>
            {check.category && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{check.category}</span>}
          </div>
          {check.criteria && (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-500">
              {check.criteria.split("\n").filter((line) => line.trim()).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        {check.result ? (
          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_COLOR[check.result]}`}>{RESULT_LABEL[check.result]}</span>
        ) : (
          canReview && (
            <button type="button" onClick={handleRemove} disabled={isPending} className="flex-shrink-0 text-xs text-slate-400 hover:text-red-600">
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
            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
          />
          <div className="flex gap-1.5">
            {(["APPROVED", "FLAGGED", "FAILED"] as const).map((r) => (
              <button
                key={r}
                type="button"
                disabled={isPending}
                onClick={() => setResult(r)}
                className={`rounded-lg px-2 py-1 text-xs font-medium ${RESULT_COLOR[r]} disabled:opacity-50`}
              >
                {RESULT_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      )}

      {check.result && check.note && <p className="text-xs text-slate-500">Nota: {check.note}</p>}

      {check.evidence.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {check.evidence.map((e) => (
            <div key={e.id} className="group relative">
              <FileChip file={e} />
              {canReview && (
                <button
                  type="button"
                  onClick={() => handleRemoveEvidence(e.id)}
                  aria-label="Eliminar evidencia"
                  className="absolute -top-1 -right-1 rounded-full bg-white p-0.5 text-slate-400 opacity-0 shadow-sm hover:text-red-600 group-hover:opacity-100"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canReview && (
        <label className="inline-block cursor-pointer text-xs text-slate-400 hover:text-slate-600 hover:underline">
          {uploading ? "Subiendo…" : "+ Evidencia"}
          <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && uploadEvidence(e.target.files[0])} />
        </label>
      )}

      {check.result === "FAILED" && canEdit && (
        <>
          <input
            list={matchingResponses.length > 0 ? `responses-${check.id}` : undefined}
            defaultValue={check.responseCategory ?? ""}
            onBlur={(e) => e.target.value !== (check.responseCategory ?? "") && handleResponseCategory(e.target.value)}
            placeholder="Categoría de tu corrección (ej. Error de lógica)…"
            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
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
        <p className="text-xs text-slate-500">Respuesta: {check.responseCategory}</p>
      )}

      {check.reviewedByName && <p className="text-[10px] text-slate-400">Revisado por {check.reviewedByName}</p>}
    </li>
  );
}

function AddDeliverableForm({ reviewRoundId }: { reviewRoundId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
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
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="w-28 flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
      <button type="button" disabled={isPending || !name.trim() || !url.trim()} onClick={handleAddLink} className="flex-shrink-0 rounded-lg bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50">
        OK
      </button>
      <button type="button" onClick={() => setOpen(false)} className="flex-shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500">
        ✕
      </button>
    </div>
  );
}

function AddCheckForm({ reviewRoundId }: { reviewRoundId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!title.trim()) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("category", category);
      const result = await addReviewCheck(reviewRoundId, formData);
      if (result.ok) {
        setTitle("");
        setCategory("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex gap-1.5">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva prueba…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
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
      const result = await addReviewMessage(round.id, formData);
      if (result.ok) {
        setBody("");
        router.refresh();
      }
    });
  }

  function handleSaveEdit(messageId: string) {
    startTransition(async () => {
      await editReviewMessage(messageId, editBody);
      setEditingId(null);
      router.refresh();
    });
  }

  if (round.messages.length === 0 && !canComment) return null;

  return (
    <div className="space-y-2 border-t border-slate-100 pt-2">
      <p className="text-xs font-medium text-slate-500">Hilo de la ronda</p>
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
            placeholder="Escribir un mensaje…"
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
