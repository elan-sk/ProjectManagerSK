"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addShareComment } from "./shareActions";

const IDENTITY_KEY = "pmsk-share-identity";

type Identity = { name: string; role: string };

function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Hilo de comentarios de la vista compartida (punto 16 confirmado con el
// usuario): público para cualquiera con el link, sin cuenta — se identifica
// una vez con nombre (obligatorio) y cargo (opcional), guardado en este
// navegador para no volver a pedirlo en cada comentario.
export function PublicCommentThread({
  token,
  adjustmentItemId,
  comments,
}: {
  token: string;
  adjustmentItemId?: string;
  comments: { id: string; authorName: string; authorRole: string | null; body: string; createdAt: string }[];
}) {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const stored = loadIdentity();
    if (stored) {
      setIdentity(stored);
      setName(stored.name);
      setRole(stored.role);
    }
  }, []);

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
      const savedIdentity = { name: name.trim(), role: role.trim() };
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(savedIdentity));
      setIdentity(savedIdentity);
      setBody("");
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      {comments.length > 0 && (
        <ul className="space-y-1.5">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg bg-slate-50 p-2 text-xs">
              <span className="font-medium text-slate-700">
                {c.authorName}
                {c.authorRole && <span className="font-normal text-slate-400"> · {c.authorRole}</span>}
              </span>
              <p className="mt-0.5 text-slate-600">{c.body}</p>
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
