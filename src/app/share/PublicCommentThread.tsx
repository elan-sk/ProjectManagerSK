"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addShareComment } from "./shareActions";
import { PublicFileGrid } from "./PublicFileGrid";
import { PublicPollCard, PublicPollFrame } from "./PublicPollCard";
import { CommentAttachments, type PendingFile } from "@/components/CommentAttachments";
import type { PublicFile, PublicPoll } from "@/lib/publicView";
import { clearShareIdentity, saveShareIdentity, useShareIdentity } from "./shareIdentity";

type CommentData = {
  id: string;
  authorName: string;
  authorRole: string | null;
  body: string;
  createdAt: string;
  attachments: PublicFile[];
  poll: PublicPoll | null;
  replies: { id: string; authorName: string; authorRole: string | null; body: string; createdAt: string; attachments: PublicFile[]; poll: PublicPoll | null }[];
};

const DATE_FMT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" };

function CommentBubble({ author, role, body, attachments, poll, token, createdAt }: { author: string; role: string | null; body: string; attachments: PublicFile[]; poll: PublicPoll | null; token: string; createdAt: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2 text-[17px]">
      {!poll && (
        <span className="font-medium text-slate-700">
          {author}
          {role && <span className="font-normal text-slate-400"> · {role}</span>}
        </span>
      )}
      {poll ? (
        <div className="mt-1.5">
          <PublicPollFrame author={{ name: author, role, date: new Date(createdAt).toLocaleString("es-CO", DATE_FMT) }}>
            <p className="whitespace-pre-wrap text-[20px] font-semibold leading-snug text-slate-900">{body}</p>
            <PublicPollCard key={poll.id} token={token} poll={poll} />
          </PublicPollFrame>
        </div>
      ) : (
        body && <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{body}</p>
      )}

      {attachments.length > 0 && (
        <div className="mt-1.5">
          <PublicFileGrid files={attachments} />
        </div>
      )}
    </div>
  );
}

// Hilo de comentarios de la vista compartida (punto 16 confirmado con el
// usuario, extendido por el punto 4): público para cualquiera con el link,
// sin cuenta — se identifica una vez con nombre (obligatorio) y cargo
// (opcional), guardado en este navegador para no volver a pedirlo en cada
// comentario. Sirve igual para el hilo de una tarea (general o de un cambio
// puntual de Ajuste) y para el de la pestaña Definición de un proyecto —
// addShareComment ya sabe a cuál de los dos cuelga según el token.
// Cada comentario admite respuestas (un solo nivel, no hilos recursivos).
export function PublicCommentThread({
  token,
  adjustmentItemId,
  reviewCheckId,
  identityAbove = false,
  allowAttachments = false,
  locked = false,
  contextLabel,
  comments,
}: {
  token: string;
  adjustmentItemId?: string;
  /** Tarea de Aceptación: el hilo es el de una característica de la ronda. */
  reviewCheckId?: string;
  /** La identificación se pide una sola vez arriba de la lista (ShareIdentityBar): acá no se repite. */
  identityAbove?: boolean;
  /** Permite adjuntar imágenes al comentario (solo hilos de tarea, mientras no esté completada). */
  allowAttachments?: boolean;
  /** Revisión cerrada: el hilo queda de solo lectura (sin comentar ni responder). */
  locked?: boolean;
  /** Nombre del ítem al que pertenece el hilo (ej. «Cambio 2»): se muestra como título del panel. */
  contextLabel?: string;
  comments: CommentData[];
}) {
  const router = useRouter();
  const identity = useShareIdentity();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [replyFiles, setReplyFiles] = useState<PendingFile[]>([]);
  const [sendingReply, setSendingReply] = useState(false);

  // Con identidad guardada manda ella; si no, lo que se esté escribiendo.
  const authorName = identity?.name ?? name;
  const authorRole = identity?.role ?? role;

  function saveIdentityIfNeeded() {
    if (identity) return;
    saveShareIdentity({ name: name.trim(), role: role.trim() });
  }

  async function handleSend() {
    if (!authorName.trim() || (!body.trim() && files.length === 0)) return;
    setSending(true);
    setError(null);
    try {
      const result = await addShareComment(token, {
        authorName: authorName.trim(),
        authorRole: authorRole.trim() || undefined,
        body: body.trim(),
        attachments: files,
        adjustmentItemId,
        reviewCheckId,
      });
      if (!result.ok) {
        setError(result.error ?? "No se pudo enviar el comentario.");
        return;
      }
      saveIdentityIfNeeded();
      setBody("");
      setFiles([]);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  async function handleReply(parentId: string) {
    if (!authorName.trim() || (!replyBody.trim() && replyFiles.length === 0)) return;
    setSendingReply(true);
    setError(null);
    try {
      const result = await addShareComment(token, {
        authorName: authorName.trim(),
        authorRole: authorRole.trim() || undefined,
        body: replyBody.trim(),
        attachments: replyFiles,
        adjustmentItemId,
        reviewCheckId,
        parentId,
      });
      if (!result.ok) {
        setError(result.error ?? "No se pudo enviar la respuesta.");
        return;
      }
      saveIdentityIfNeeded();
      setReplyBody("");
      setReplyFiles([]);
      setReplyingTo(null);
      router.refresh();
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <div className={contextLabel ? "mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5" : "space-y-2"}>
      {contextLabel && <p className="text-[17px] font-semibold text-slate-600">💬 Comentarios y preguntas · {contextLabel}</p>}
      {comments.length > 0 && (
        <ul className="space-y-1.5">
          {comments.map((c) => (
            <li key={c.id} className="space-y-1">
              <CommentBubble author={c.authorName} role={c.authorRole} body={c.body} attachments={c.attachments} poll={c.poll} token={token} createdAt={c.createdAt} />
              {!locked && (
                <button
                  type="button"
                  onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                  className="ml-2 text-[15px] text-slate-400 hover:underline"
                >
                  Responder
                </button>
              )}
              {c.replies.length > 0 && (
                <ul className="ml-4 space-y-1">
                  {c.replies.map((r) => (
                    <li key={r.id}>
                      <CommentBubble author={r.authorName} role={r.authorRole} body={r.body} attachments={r.attachments} poll={r.poll} token={token} createdAt={r.createdAt} />
                    </li>
                  ))}
                </ul>
              )}
              {replyingTo === c.id && !locked && (
                <div data-paste-zone className="ml-4 space-y-1 rounded-lg p-1.5">
                  {!identity && !identityAbove && (
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Tu nombre"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[17px]"
                    />
                  )}
                  <div className="flex gap-1.5">
                    <input
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleReply(c.id)}
                      placeholder="Responder…"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[17px]"
                    />
                    <button
                      type="button"
                      disabled={sendingReply || !authorName.trim() || (!replyBody.trim() && replyFiles.length === 0)}
                      onClick={() => handleReply(c.id)}
                      className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[17px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      Enviar
                    </button>
                  </div>
                  {allowAttachments && <CommentAttachments files={replyFiles} onChange={setReplyFiles} token={token} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {locked ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-500">
          Este hilo está cerrado: la calificación ya fue enviada. Solo el equipo puede habilitar una nueva revisión.
        </p>
      ) : (
      <div data-paste-zone className="space-y-1.5 rounded-lg p-1.5">
        {!identity && !identityAbove && (
          <div className="flex gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[17px]"
            />
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Tu cargo (opcional)"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[17px]"
            />
          </div>
        )}
        {identity && !identityAbove && (
          <p className="text-[15px] text-slate-400">
            Comentando como <span className="font-medium text-slate-600">{identity.name}</span>
            {identity.role && ` · ${identity.role}`} ·{" "}
            <button type="button" onClick={clearShareIdentity} className="hover:underline">
              cambiar
            </button>
          </p>
        )}
        <div className="flex gap-1.5">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={identityAbove && !identity ? "Primero se debe indicar el nombre arriba" : "Escribir un comentario…"}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[17px]"
          />
          <button
            type="button"
            disabled={sending || !authorName.trim() || (!body.trim() && files.length === 0)}
            onClick={handleSend}
            className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[17px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Comentar
          </button>
        </div>
        {allowAttachments && <CommentAttachments files={files} onChange={setFiles} token={token} />}
        {error && <p className="text-[17px] text-red-600">{error}</p>}
      </div>
      )}
    </div>
  );
}
