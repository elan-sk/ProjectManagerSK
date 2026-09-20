"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectIcon } from "@/components/ProjectIcon";
import { PublicFileGrid } from "./PublicFileGrid";
import { PublicUploadWidget } from "./PublicUploadWidget";
import { PublicCommentThread } from "./PublicCommentThread";
import { ShareIdentityBar } from "./ShareIdentityBar";
import { PublicAcceptancePanel } from "./PublicAcceptancePanel";
import { addPublicTaskInsumo, addPublicTaskInsumoLink, submitPublicAdjustmentReview } from "./shareActions";
import { useShareIdentity } from "./shareIdentity";
import type { PublicTask, PublicFile, PublicAdjustmentItem, PublicAcceptanceRound, PublicCommentWithReplies } from "@/lib/publicView";

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };

function beforeAfterSequence(item: PublicAdjustmentItem) {
  return [...item.before.map((f) => ({ ...f, group: "Antes" })), ...item.after.map((f) => ({ ...f, group: "Después" }))];
}

/**
 * Vista compartida de una tarea puntual (punto 16 confirmado con el usuario):
 * descripción completa, insumos y evidencia visibles/descargables (pero solo
 * se puede SUBIR insumo — la evidencia la sube nada más el asignado, adentro
 * de la app), antes/después de los cambios si es tipo Ajuste, y comentarios
 * públicos. Nunca hay botón de eliminar ni de editar nada, y nunca se
 * muestra el estado de la tarea (mismo criterio que la lista de Tareas del
 * proyecto). Para tipo Prueba (QA) esto solo muestra la descripción — las
 * pruebas/checks nunca llegan a esta vista (ver getPublicTask en
 * publicView.ts). El bloque de Insumos/Resultados tampoco aplica a tipo
 * Ajuste ni Aceptación — puertas adentro esas tareas nunca usan Attachment
 * genérico. Para tipo Ajuste, los comentarios son SOLO por cada cambio
 * puntual — no hay un hilo general aparte, para no duplicar la conversación.
 * Para tipo Aceptación, a diferencia de QA, SÍ se exponen las rondas/checks
 * (PublicAcceptancePanel) — es la lista de características que el cliente
 * tiene que ir aceptando o devolviendo.
 */
export function PublicTaskDetail({
  token,
  data,
}: {
  token: string;
  data: {
    project: { id: string; name: string; iconUrl: string | null };
    task: PublicTask;
    insumos: PublicFile[];
    evidencia: PublicFile[];
    adjustmentItems: PublicAdjustmentItem[];
    acceptanceRounds: PublicAcceptanceRound[];
    comments: PublicCommentWithReplies[];
  };
}) {
  const { project, task, insumos, evidencia, adjustmentItems, acceptanceRounds, comments } = data;
  const canUploadInsumo = task.status !== "COMPLETED";

  // Revisión de los cambios (tarea tipo Ajuste): cada calificación es un borrador
  // hasta que se envía la revisión completa con el botón del final.
  const router = useRouter();
  const identity = useShareIdentity();
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [sendingReview, setSendingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const openItems = adjustmentItems.filter((i) => i.reviewOpen);
  const allRated = openItems.length > 0 && openItems.every((i) => typeof decisions[i.id] === "boolean");

  async function sendReview() {
    if (!identity) return;
    setSendingReview(true);
    setReviewError(null);
    try {
      const result = await submitPublicAdjustmentReview(token, { name: identity.name, role: identity.role, decisions });
      if (!result.ok) {
        setReviewError(result.error);
        return;
      }
      setDecisions({});
      router.refresh();
    } finally {
      setSendingReview(false);
    }
  }

  async function uploadInsumo(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("token", token);
    const res = await fetch("/api/upload/public", { method: "POST", body: formData });
    const body = await res.json();
    if (!res.ok) return body.error ?? "No se pudo subir el archivo.";
    const result = await addPublicTaskInsumo(token, body);
    if (!result.ok) return "error" in result ? result.error : "No se pudo guardar el insumo.";
  }

  async function addInsumoLink(url: string, name: string) {
    const result = await addPublicTaskInsumoLink(token, url, name);
    if (!result.ok) return result.error;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-1.5 text-[17px] font-medium text-slate-400">
          <ProjectIcon name={project.name} iconUrl={project.iconUrl} size="h-4 w-4 text-[8px]" />
          {project.name}
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">{task.title}</h1>
        <p className="text-[17px] text-slate-400">{task.phaseName}</p>
        {task.description && (
          <div className="prose prose-lg max-w-none text-slate-600" dangerouslySetInnerHTML={{ __html: task.description }} />
        )}
        <p className="text-[17px] text-slate-500">
          Estimado: {new Date(task.plannedStart).toLocaleDateString("es-CO", DATE_FMT)} — {new Date(task.plannedEnd).toLocaleDateString("es-CO", DATE_FMT)}
        </p>
      </div>

      {task.type !== "QA" && task.type !== "ADJUSTMENT" && task.type !== "ACCEPTANCE" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-[21px] font-semibold text-slate-900">Insumos</h2>
            <PublicFileGrid files={insumos} />
            {canUploadInsumo ? (
              <PublicUploadWidget onUploadFile={uploadInsumo} onAddLink={addInsumoLink} label="+ Subir insumo" />
            ) : (
              <p className="text-[17px] text-slate-400">La tarea ya está completada — no se pueden subir más insumos.</p>
            )}
          </div>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-[21px] font-semibold text-slate-900">Evidencias</h2>
            <PublicFileGrid files={evidencia} />
          </div>
        </div>
      )}

      {task.type === "ADJUSTMENT" && (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-[21px] font-semibold text-slate-900">Cambios solicitados</h2>
          {adjustmentItems.length > 0 && <ShareIdentityBar />}
          {adjustmentItems.length === 0 && <p className="text-[18px] text-slate-400">Sin cambios cargados todavía.</p>}
          {adjustmentItems.map((item, index) => (
            <div key={item.id} className="space-y-2 rounded-xl border border-l-4 border-slate-300 border-l-[#0a6b78] bg-white p-3 shadow-sm">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#0a6b78]">Cambio {index + 1} de {adjustmentItems.length}</p>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${item.answered ? "bg-emerald-500" : "bg-amber-500"}`}
                  title={item.answered ? "Respondido" : "Todavía no se ha realizado"}
                />
                <p className="text-[19px] font-semibold text-slate-800">{item.description}</p>
              </div>
              {!item.answered && <p className="text-[17px] text-amber-600">Todavía no se ha realizado.</p>}
              {/* Un solo carrusel: al terminar las imágenes de Antes sigue con las de Después. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">Antes</p>
                  <PublicFileGrid files={item.before} sequence={beforeAfterSequence(item)} />
                </div>
                <div className="space-y-1">
                  <p className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Después</p>
                  <PublicFileGrid files={item.after} sequence={beforeAfterSequence(item)} />
                </div>
              </div>
              {item.note && <p className="text-[17px] text-slate-500">Nota: {item.note}</p>}
              {item.reviewOpen ? (
                <fieldset className="space-y-1 rounded-lg bg-slate-50 p-2 text-[15px] text-slate-700">
                  <legend className="px-1 font-medium">Calificación de este cambio</legend>
                  {item.clientApproval !== null && (
                    <p className="text-[13px] text-slate-500">
                      El equipo habilitó una nueva revisión. La calificación anterior fue: {item.clientApproval ? "aprobado" : "necesita cambios"}.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name={`review-${item.id}`} checked={decisions[item.id] === true} onChange={() => setDecisions((d) => ({ ...d, [item.id]: true }))} /> Apruebo
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name={`review-${item.id}`} checked={decisions[item.id] === false} onChange={() => setDecisions((d) => ({ ...d, [item.id]: false }))} /> Necesita cambios
                    </label>
                  </div>
                </fieldset>
              ) : (
                item.clientApproval !== null && (
                  <p className={`rounded-lg px-3 py-2 text-[15px] ${item.clientApproval ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                    {item.clientApproval
                      ? `✓ Aprobado${item.clientApprovalBy ? ` por ${item.clientApprovalBy}` : ""}. Esta calificación ya no puede modificarse.`
                      : `Se solicitaron cambios${item.clientApprovalBy ? ` (${item.clientApprovalBy})` : ""}. Queda a la espera de que el equipo habilite una nueva revisión.`}
                  </p>
                )
              )}
              <PublicCommentThread token={token} adjustmentItemId={item.id} contextLabel={`Cambio ${index + 1}`} identityAbove allowAttachments={canUploadInsumo} locked={!item.reviewOpen} comments={item.comments} />
            </div>
          ))}
          {canUploadInsumo && openItems.length > 0 && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[15px] text-slate-700">
                Al enviar la revisión, las calificaciones quedan cerradas y no podrán modificarse. Solo el equipo puede habilitar una nueva revisión.
              </p>
              {!identity && <p className="text-[13px] text-amber-700">Falta indicar el nombre en la parte superior de esta sección.</p>}
              {identity && !allRated && <p className="text-[13px] text-slate-500">Falta calificar todos los cambios para poder enviar.</p>}
              {reviewError && <p className="text-[13px] text-red-600">{reviewError}</p>}
              <button
                type="button"
                disabled={sendingReview || !identity || !allRated}
                onClick={sendReview}
                className="rounded-lg bg-slate-900 px-4 py-2 text-[15px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {sendingReview ? "Enviando…" : "Enviar mi revisión"}
              </button>
            </div>
          )}
          {openItems.length === 0 && adjustmentItems.some((i) => i.clientApproval !== null) && (
            <p className="text-[13px] text-slate-500">La revisión fue enviada. Cada calificación permanece cerrada hasta que el equipo habilite una nueva.</p>
          )}
        </div>
      )}

      {(task.type === "ADJUSTMENT" || task.type === "ACCEPTANCE") && insumos.length > 0 && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-[21px] font-semibold text-slate-900">Insumos</h2>
          <PublicFileGrid files={insumos} />
        </div>
      )}

      {task.type === "ACCEPTANCE" && <PublicAcceptancePanel token={token} rounds={acceptanceRounds} />}

      {task.type !== "ADJUSTMENT" && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-[21px] font-semibold text-slate-900">Comentarios</h2>
          <PublicCommentThread token={token} allowAttachments={canUploadInsumo} comments={comments} />
        </div>
      )}
    </div>
  );
}
