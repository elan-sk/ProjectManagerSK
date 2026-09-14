"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addShareComment } from "./shareActions";
import { loadShareIdentity, saveShareIdentity, type ShareIdentity } from "./shareIdentity";

type Identity = ShareIdentity;

type CommentData = {
  id: string;
  authorName: string;
  authorRole: string | null;
  body: string;
  createdAt: string;
  replies: { id: string; authorName: string; authorRole: string | null; body: string; createdAt: string }[];
};

function CommentBubble({ author, role, body }: { author: string; role: string | null; body: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2 text-xs">
      <span className="font-medium text-slate-700">
        {author}
        {role && <span className="font-normal text-slate-400"> · {role}</span>}
      </span>
      <p className="mt-0.5 text-slate-600">{body}</p>
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
  comments,
}: {
  token: string;
  adjustmentItemId?: string;
  comments: CommentData[];
}) {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    const stored = loadShareIdentity();
    if (stored) {
      setIdentity(stored);
      setName(stored.name);
      setRole(stored.role);
    }
  }, []);

  function saveIdentityIfNeeded() {
    if (identity) return;
    const savedIdentity = { name: name.trim(), role: role.trim() };
    saveShareIdentity(savedIdentity);
    setIdentity(savedIdentity);
  }

  async function handleSend() {
    if (!name.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const result = await addShareComment(token, {
        authorName: name.trim(),
        authorRole: role.trim() || undefined,
        body: body.trim(),
        adjustmentItemId,
      });
      if (!result.ok) {
        setError(result.error ?? "No se pudo enviar el comentario.");
        return;
      }
      saveIdentityIfNeeded();
      setBody("");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  async function handleReply(parentId: string) {
    if (!name.trim() || !replyBody.trim()) return;
    setSendingReply(true);
    setError(null);
    try {
      const result = await addShareComment(token, {
        authorName: name.trim(),
        authorRole: role.trim() || undefined,
        body: replyBody.trim(),
        adjustmentItemId,
        parentId,
      });
      if (!result.ok) {
        setError(result.error ?? "No se pudo enviar la respuesta.");
        return;
      }
      saveIdentityIfNeeded();
      setReplyBody("");
      setReplyingTo(null);
      router.refresh();
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <div className="space-y-2">
      {comments.length > 0 && (
        <ul className="space-y-1.5">
          {comments.map((c) => (
            <li key={c.id} className="space-y-1">
              <CommentBubble author={c.authorName} role={c.authorRole} body={c.body} />
              <button
                type="button"
                onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                className="ml-2 text-[11px] text-slate-400 hover:underline"
              >
                Responder
              </button>
              {c.replies.length > 0 && (
                <ul className="ml-4 space-y-1">
                  {c.replies.map((r) => (
                    <li key={r.id}>
                      <CommentBubble author={r.authorName} role={r.authorRole} body={r.body} />
                    </li>
                  ))}
                </ul>
              )}
              {replyingTo === c.id && (
                <div className="ml-4 space-y-1">
                  {!identity && (
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Tu nombre"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    />
                  )}
                  <div className="flex gap-1.5">
                    <input
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleReply(c.id)}
                      placeholder="Responder…"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      disabled={sendingReply || !name.trim() || !replyBody.trim()}
                      onClick={() => handleReply(c.id)}
                      className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        {!identity && (
          <div className="flex gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Tu cargo (opcional)"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
          </div>
        )}
        <div className="flex gap-1.5">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Escribir un comentario…"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            disabled={sending || !name.trim() || !body.trim()}
            onClick={handleSend}
            className="flex-shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Comentar
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
