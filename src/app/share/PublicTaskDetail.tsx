"use client";

import { ProjectIcon } from "@/components/ProjectIcon";
import { PublicFileGrid } from "./PublicFileGrid";
import { PublicUploadWidget } from "./PublicUploadWidget";
import { PublicCommentThread } from "./PublicCommentThread";
import { PublicAcceptancePanel } from "./PublicAcceptancePanel";
import { addPublicTaskInsumo, addPublicTaskInsumoLink } from "./shareActions";
import type { PublicTask, PublicFile, PublicAdjustmentItem, PublicAcceptanceRound, PublicCommentWithReplies } from "@/lib/publicView";

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" };

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
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <ProjectIcon name={project.name} iconUrl={project.iconUrl} size="h-4 w-4 text-[8px]" />
          {project.name}
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{task.title}</h1>
        <p className="text-xs text-slate-400">{task.phaseName}</p>
        {task.description && (
          <div className="prose prose-sm max-w-none text-sm text-slate-600" dangerouslySetInnerHTML={{ __html: task.description }} />
        )}
        <p className="text-xs text-slate-500">
          Estimado: {new Date(task.plannedStart).toLocaleDateString("es-CO", DATE_FMT)} — {new Date(task.plannedEnd).toLocaleDateString("es-CO", DATE_FMT)}
        </p>
      </div>

      {task.type !== "QA" && task.type !== "ADJUSTMENT" && task.type !== "ACCEPTANCE" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-slate-900">Insumos</h2>
            <PublicFileGrid files={insumos} />
            {canUploadInsumo ? (
              <PublicUploadWidget onUploadFile={uploadInsumo} onAddLink={addInsumoLink} label="+ Subir insumo" />
            ) : (
              <p className="text-xs text-slate-400">La tarea ya está completada — no se pueden subir más insumos.</p>
            )}
          </div>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-slate-900">Evidencias</h2>
            <PublicFileGrid files={evidencia} />
          </div>
        </div>
      )}

      {task.type === "ADJUSTMENT" && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Cambios solicitados</h2>
          {adjustmentItems.length === 0 && <p className="text-sm text-slate-400">Sin cambios cargados todavía.</p>}
          {adjustmentItems.map((item) => (
            <div key={item.id} className="space-y-2 rounded-lg border border-slate-100 p-3">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${item.answered ? "bg-emerald-500" : "bg-amber-500"}`}
                  title={item.answered ? "Respondido" : "Todavía no se ha realizado"}
                />
                <p className="text-sm font-medium text-slate-800">{item.description}</p>
              </div>
              {!item.answered && <p className="text-xs text-amber-600">Todavía no se ha realizado.</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-500">Antes</p>
                  <PublicFileGrid files={item.before} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-500">Después</p>
                  <PublicFileGrid files={item.after} />
                </div>
              </div>
              {item.note && <p className="text-xs text-slate-500">Nota: {item.note}</p>}
              {item.clientApproval !== null && (
                <p className={`text-xs ${item.clientApproval ? "text-emerald-700" : "text-amber-700"}`}>
                  Cliente: {item.clientApproval ? "aprobó el ajuste" : "solicitó cambios"}{item.clientApprovalBy ? ` · ${item.clientApprovalBy}` : ""}.
                </p>
              )}
              <PublicCommentThread token={token} adjustmentItemId={item.id} requireAdjustmentApproval comments={item.comments} />
            </div>
          ))}
        </div>
      )}

      {task.type === "ACCEPTANCE" && <PublicAcceptancePanel token={token} rounds={acceptanceRounds} />}

      {task.type !== "ADJUSTMENT" && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Comentarios</h2>
          <PublicCommentThread token={token} comments={comments} />
        </div>
      )}
    </div>
  );
}
