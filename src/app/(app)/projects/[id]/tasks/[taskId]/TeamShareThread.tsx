"use client";

import { Linkify } from "@/lib/linkify";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommentAttachments, type PendingFile } from "@/components/CommentAttachments";
import { AttachmentGrid, type AttachmentGridItem } from "./AttachmentGrid";
import { addTeamProjectShareComment, addTeamShareComment } from "./shareThreadActions";
import { TeamPollCard, PollFrame } from "./TeamPollCard";

/** Pregunta del equipo con su estadística (solo la ve la vista interna). */
export type TeamPoll = {
  id: string;
  multiple: boolean;
  closed: boolean;
  totalVoters: number;
  /** Opciones que eligió quien está viendo la página. */
  myVoteIds: string[];
  options: { id: string; label: string; voters: { name: string; role: string | null; fromTeam: boolean }[] }[];
};

export type TeamThreadComment = {
  id: string;
  authorName: string;
  authorRole: string | null;
  fromTeam: boolean;
  body: string;
  createdAt: string;
  attachments: AttachmentGridItem[];
  poll: TeamPoll | null;
  replies: Omit<TeamThreadComment, "replies">[];
};

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" };

function Bubble({ c, canVote, canClose }: { c: Omit<TeamThreadComment, "replies">; canVote: boolean; canClose: boolean }) {
  return (
    <div className={`rounded-lg p-2 text-[17px] ${c.fromTeam ? "bg-sky-50" : "bg-slate-50"}`}>
      {!c.poll && (
        <span className="font-medium text-slate-700">
          {c.authorName}
          {c.authorRole && <span className="font-normal text-slate-400"> · {c.authorRole}</span>}
          <span className="font-normal text-slate-400"> · {new Date(c.createdAt).toLocaleString("es-CO", DATE_FMT)}</span>
        </span>
      )}
      {c.poll ? (
        <div className="mt-1.5">
          <PollFrame author={{ name: c.authorName, role: c.authorRole, date: new Date(c.createdAt).toLocaleString("es-CO", DATE_FMT) }}>
            <p className="whitespace-pre-wrap text-[20px] font-semibold leading-snug text-slate-900"><Linkify text={c.body} /></p>
            <TeamPollCard key={`${c.poll.id}-${c.poll.myVoteIds.join(",")}`} poll={c.poll} canVote={canVote} canClose={canClose} />
          </PollFrame>
        </div>
      ) : (
        c.body && <p className="mt-0.5 whitespace-pre-wrap text-slate-600"><Linkify text={c.body} /></p>
      )}
      {c.attachments.length > 0 && <AttachmentGrid items={c.attachments} canDelete={false} className="mt-1.5 grid grid-cols-3 gap-2" />}
    </div>
  );
}

/** Campos para armar una pregunta: tipo (única/múltiple) y de 2 a 10 opciones. */
export function PollFields({ multiple, setMultiple, options, setOptions }: {
  multiple: boolean;
  setMultiple: (v: boolean) => void;
  options: string[];
  setOptions: (fn: (prev: string[]) => string[]) => void;
}) {
  return (
    <div className="space-y-1.5 rounded-lg bg-slate-50 p-2">
      <div className="flex flex-wrap gap-3 text-[15px] text-slate-700">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={!multiple} onChange={() => setMultiple(false)} /> Selección única
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={multiple} onChange={() => setMultiple(true)} /> Selección múltiple
        </label>
      </div>
      {options.map((o, i) => (
        <div key={i} className="flex gap-1.5">
          <input
            value={o}
            onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={`Opción ${i + 1}`}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[15px]"
          />
          {options.length > 2 && (
            <button type="button" aria-label="Quitar opción" onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))} className="px-2 text-slate-400 hover:text-red-600">
              ✕
            </button>
          )}
        </div>
      ))}
      {options.length < 10 && (
        <button type="button" onClick={() => setOptions((prev) => [...prev, ""])} className="text-[15px] text-slate-500 hover:underline">
          + Agregar opción
        </button>
      )}
    </div>
  );
}

// Composer de respuesta del equipo (texto + imágenes). Es el mismo hilo que ve
// el cliente en su link: lo que se escribe acá le llega con la etiqueta «Equipo».
function Composer({ taskId, projectId, adjustmentItemId, reviewCheckId, parentId, placeholder, canAttach, allowPoll = false, onDone }: {
  taskId?: string;
  /** Hilo de la Definición del proyecto (sin tarea). */
  projectId?: string;
  adjustmentItemId?: string;
  reviewCheckId?: string;
  parentId?: string;
  placeholder: string;
  canAttach: boolean;
  /** Permite publicar una pregunta (selección única o múltiple) en vez de un comentario. */
  allowPoll?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asPoll, setAsPoll] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [options, setOptions] = useState(["", ""]);

  const filledOptions = options.map((o) => o.trim()).filter(Boolean);
  const pollReady = body.trim() !== "" && filledOptions.length >= 2;

  async function send() {
    if (asPoll ? !pollReady : !body.trim() && files.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const result = projectId
        ? await addTeamProjectShareComment(projectId, asPoll ? { body, poll: { multiple, options } } : { body, parentId })
        : await addTeamShareComment(taskId!, asPoll ? { body, adjustmentItemId, reviewCheckId, poll: { multiple, options } } : { body, adjustmentItemId, reviewCheckId, parentId, attachments: files });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      setFiles([]);
      setAsPoll(false);
      setMultiple(false);
      setOptions(["", ""]);
      onDone?.();
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div data-paste-zone className="space-y-1 rounded-lg p-1.5">
      <div className="flex gap-1.5">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !asPoll && send()}
          placeholder={asPoll ? "Enunciado de la pregunta…" : placeholder}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[17px]"
        />
        <button
          type="button"
          disabled={sending || (asPoll ? !pollReady : !body.trim() && files.length === 0)}
          onClick={send}
          className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[17px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {asPoll ? "Publicar pregunta" : "Enviar"}
        </button>
      </div>

      {asPoll && <PollFields multiple={multiple} setMultiple={setMultiple} options={options} setOptions={setOptions} />}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {!asPoll && canAttach && <CommentAttachments files={files} onChange={setFiles} />}
        {allowPoll && (
          <button type="button" onClick={() => setAsPoll((v) => !v)} className="text-[15px] text-slate-500 hover:text-slate-900">
            {asPoll ? "Volver a comentario" : "Hacer una pregunta"}
          </button>
        )}
      </div>
      {error && <p className="text-[17px] text-red-600">{error}</p>}
    </div>
  );
}

/** Hilo de comentarios del link compartido, visto desde adentro de la app. */
export function TeamShareThread({ taskId, projectId, adjustmentItemId, reviewCheckId, contextLabel, comments, canReply, canVote, canAttach }: {
  taskId?: string;
  /** Hilo de la Definición del proyecto (sin tarea): las respuestas y preguntas cuelgan del proyecto. */
  projectId?: string;
  adjustmentItemId?: string;
  /** Tarea de Aceptación: hilo de una característica de la ronda. */
  reviewCheckId?: string;
  /** Nombre del ítem al que pertenece el hilo (ej. «Cambio 2»): se muestra como título del panel. */
  contextLabel?: string;
  comments: TeamThreadComment[];
  canReply: boolean;
  /** Puede responder las preguntas (asignados, revisores, PM y admin). */
  canVote: boolean;
  /** Falso cuando la tarea está completada (misma regla que los insumos). */
  canAttach: boolean;
}) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  return (
    <div className={contextLabel ? "mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5" : "space-y-2"}>
      {contextLabel && <p className="text-[17px] font-semibold text-slate-600">💬 Comentarios y preguntas · {contextLabel}</p>}
      {comments.length > 0 && (
        <ul className="space-y-1.5">
          {comments.map((c) => (
            <li key={c.id} className="space-y-1">
              <Bubble c={c} canVote={canVote} canClose={canReply} />
              {canReply && (
                <button type="button" onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)} className="ml-2 text-[15px] text-slate-400 hover:underline">
                  Responder
                </button>
              )}
              {c.replies.length > 0 && (
                <ul className="ml-4 space-y-1">
                  {c.replies.map((r) => (
                    <li key={r.id}>
                      <Bubble c={r} canVote={canVote} canClose={canReply} />
                    </li>
                  ))}
                </ul>
              )}
              {replyingTo === c.id && (
                <div className="ml-4">
                  <Composer taskId={taskId} projectId={projectId} adjustmentItemId={adjustmentItemId} reviewCheckId={reviewCheckId} parentId={c.id} placeholder="Responder…" canAttach={canAttach} onDone={() => setReplyingTo(null)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canReply && (
        <Composer taskId={taskId} projectId={projectId} adjustmentItemId={adjustmentItemId} reviewCheckId={reviewCheckId} placeholder="Escribir al cliente…" canAttach={canAttach} allowPoll />
      )}
    </div>
  );
}
