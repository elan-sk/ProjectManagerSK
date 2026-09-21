"use client";

import { Linkify } from "@/lib/linkify";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CommentAttachments, type PendingFile } from "@/components/CommentAttachments";
import { AttachmentGrid, type AttachmentGridItem } from "./AttachmentGrid";
import { PollFields, type TeamPoll } from "./TeamShareThread";
import { TeamPollCard, PollFrame } from "./TeamPollCard";
import { addRoundMessage } from "./shareThreadActions";
import { editReviewMessage } from "./reviewActions";

export type RoundMessage = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
  attachments: AttachmentGridItem[];
  poll: TeamPoll | null;
};

// Hilo interno de una ronda (Prueba y Aceptación): solo lo ve el equipo. Admite
// texto, imágenes y preguntas de selección única o múltiple con estadística de
// quién respondió qué. Los mensajes de texto se pueden editar (solo su autor);
// nunca se borran.
export function RoundThread({ roundId, messages, userId, canComment, canVote, canClose, canAttach }: {
  roundId: string;
  messages: RoundMessage[];
  userId: string | null;
  canComment: boolean;
  canVote: boolean;
  canClose: boolean;
  canAttach: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [asPoll, setAsPoll] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [isPending, startTransition] = useTransition();

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = asPoll ? body.trim() !== "" && filled.length >= 2 : body.trim() !== "" || files.length > 0;

  function handleSend() {
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const result = await addRoundMessage(roundId, asPoll ? { body, poll: { multiple, options } } : { body, attachments: files });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      setFiles([]);
      setAsPoll(false);
      setMultiple(false);
      setOptions(["", ""]);
      router.refresh();
    });
  }

  function handleSaveEdit(messageId: string) {
    startTransition(async () => {
      await editReviewMessage(messageId, editBody);
      setEditingId(null);
      router.refresh();
    });
  }

  if (messages.length === 0 && !canComment) return null;

  return (
    <div className="space-y-2 border-t border-slate-100 pt-2">
      <p className="text-[18px] font-semibold text-slate-600">💬 Conversación general de la ronda</p>
      <ul className="space-y-1.5">
        {messages.map((m) => (
          <li key={m.id} className="rounded-lg bg-slate-50 p-2 text-[18px]">
            {!m.poll && <span className="font-medium text-slate-700">{m.authorName}:</span>}{" "}
            {m.poll ? (
              <div className="mt-1.5">
                <PollFrame author={{ name: m.authorName, role: "Equipo", date: new Date(m.createdAt).toLocaleString("es-CO") }}>
                  <p className="whitespace-pre-wrap text-[20px] font-semibold leading-snug text-slate-900"><Linkify text={m.body} /></p>
                  <TeamPollCard key={`${m.poll.id}-${m.poll.myVoteIds.join(",")}`} poll={m.poll} canVote={canVote} canClose={canClose} />
                </PollFrame>
              </div>
            ) : editingId === m.id ? (
              <span className="inline-flex items-center gap-1">
                <input value={editBody} onChange={(e) => setEditBody(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-0.5 text-[17px]" />
                <button type="button" onClick={() => handleSaveEdit(m.id)} className="text-[17px] text-slate-900 hover:underline">
                  Guardar
                </button>
              </span>
            ) : (
              <>
                <span className="whitespace-pre-wrap text-slate-600"><Linkify text={m.body} /></span>
                {m.editedAt && <span className="ml-1 text-[13px] text-slate-400">(editado)</span>}
                {m.authorId === userId && !m.poll && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(m.id);
                      setEditBody(m.body);
                    }}
                    className="ml-1.5 text-[13px] text-slate-400 hover:underline"
                  >
                    Editar
                  </button>
                )}
              </>
            )}
            {m.attachments.length > 0 && <AttachmentGrid items={m.attachments} canDelete={canComment && m.authorId === userId} className="mt-1.5 grid grid-cols-3 gap-2" />}
          </li>
        ))}
      </ul>

      {canComment && (
        <div data-paste-zone className="space-y-1 rounded-lg p-1.5">
          <div className="flex gap-1.5">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !asPoll && handleSend()}
              placeholder={asPoll ? "Enunciado de la pregunta…" : "Escribir un mensaje…"}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[17px]"
            />
            <button
              type="button"
              disabled={isPending || !ready}
              onClick={handleSend}
              className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[17px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {asPoll ? "Publicar pregunta" : "Enviar"}
            </button>
          </div>
          {asPoll && <PollFields multiple={multiple} setMultiple={setMultiple} options={options} setOptions={setOptions} />}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {!asPoll && canAttach && <CommentAttachments files={files} onChange={setFiles} />}
            <button type="button" onClick={() => setAsPoll((v) => !v)} className="text-[15px] text-slate-500 hover:text-slate-900">
              {asPoll ? "Volver a mensaje" : "Hacer una pregunta"}
            </button>
          </div>
          {error && <p className="text-[17px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
