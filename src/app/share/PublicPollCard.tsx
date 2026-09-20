"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { submitPublicPollVote } from "./shareActions";
import { saveShareIdentity, useShareIdentity } from "./shareIdentity";
import { Avatar } from "@/components/Avatar";
import type { PublicPoll } from "@/lib/publicView";

// Respuesta anterior de esta persona, guardada en este navegador para mostrarla
// marcada. El servidor nunca devuelve votos ni resultados al externo.
const storageKey = (pollId: string) => `pmsk-poll-${pollId}`;
const listeners = new Set<() => void>();

function readMine(pollId: string): string {
  try {
    return localStorage.getItem(storageKey(pollId)) ?? "[]";
  } catch {
    return "[]";
  }
}
function saveMine(pollId: string, ids: string[]) {
  try {
    localStorage.setItem(storageKey(pollId), JSON.stringify(ids));
  } catch {}
  listeners.forEach((l) => l());
}

/** Marco que separa una pregunta de los comentarios: borde de color, etiqueta «Pregunta del equipo» y quién la hizo. */
export function PublicPollFrame({ children, author }: { children: React.ReactNode; author?: { name: string; role?: string | null; date?: string } }) {
  return (
    <div className="space-y-1.5 rounded-xl border-2 border-[#0a6b78]/40 bg-white p-2.5">
      <span className="inline-block rounded-full bg-[#0a6b78] px-2.5 py-0.5 text-[13px] font-semibold uppercase tracking-wide text-white">Pregunta del equipo</span>
      {author && (
        <div className="flex items-center gap-2 text-[17px]">
          <Avatar name={author.name} avatarUrl={null} size="h-8 w-8 text-[14px]" />
          <p className="text-slate-500">
            <span className="font-semibold text-slate-900">{author.name}</span>
            {author.role && <span> · {author.role}</span>} hizo esta pregunta{author.date && <span className="text-slate-400"> · {author.date}</span>}
          </p>
        </div>
      )}
      {children}
    </div>
  );
}

// Pregunta del equipo vista desde el link compartido: selección única (radio) o
// múltiple (casillas). Se identifica con el mismo nombre de los comentarios y la
// respuesta puede cambiarse hasta que el equipo cierre la pregunta.
export function PublicPollCard({ token, poll }: { token: string; poll: PublicPoll }) {
  const identity = useShareIdentity();
  const stored = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => readMine(poll.id),
    () => "[]"
  );
  const mine = useMemo<string[]>(() => JSON.parse(stored), [stored]);
  // Borrador de lo que se está marcando; sin tocar nada, se muestra la respuesta ya enviada.
  const [draft, setDraft] = useState<string[] | null>(null);
  const selected = draft ?? mine;
  const answered = draft === null && mine.length > 0;
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setDraft((poll.multiple ? (selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]) : [id]));
  }

  async function send() {
    const voterName = identity?.name ?? name.trim();
    if (!voterName || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitPublicPollVote(token, poll.id, { name: voterName, role: identity?.role ?? role.trim(), optionIds: selected });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!identity) saveShareIdentity({ name: voterName, role: role.trim() });
      saveMine(poll.id, selected);
      setDraft(null);
    } finally {
      setBusy(false);
    }
  }

  const disabled = poll.closed;

  return (
    <div className="mt-2 space-y-2">
      <p className="text-[13px] text-slate-500">
        {poll.multiple ? "Se pueden elegir varias opciones." : "Se puede elegir una sola opción."}
        {poll.closed && " La pregunta está cerrada."}
      </p>
      <ul className="space-y-1.5">
        {poll.options.map((o) => (
          <li key={o.id}>
            <label className={`flex items-center gap-2 text-[17px] text-slate-800 ${disabled ? "opacity-70" : "cursor-pointer"}`}>
              <input
                type={poll.multiple ? "checkbox" : "radio"}
                name={`poll-${poll.id}`}
                disabled={disabled}
                checked={selected.includes(o.id)}
                onChange={() => toggle(o.id)}
              />
              <span className="min-w-0 break-words">{o.label}</span>
            </label>
          </li>
        ))}
      </ul>

      {!disabled && !identity && (
        <div className="flex flex-wrap gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[15px]" />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Cargo (opcional)" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-[15px]" />
        </div>
      )}

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {answered && !error && <p className="text-[13px] text-emerald-700">Respuesta registrada. Puede modificarse hasta que el equipo cierre la pregunta.</p>}

      {!disabled && (
        <button
          type="button"
          disabled={busy || selected.length === 0 || (!identity && !name.trim()) || answered}
          onClick={send}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-[15px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Enviando…" : "Enviar respuesta"}
        </button>
      )}
    </div>
  );
}
