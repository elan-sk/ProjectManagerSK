"use client";

import { Linkify } from "@/lib/linkify";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSharePollClosed, voteSharePoll } from "./shareThreadActions";
import { Avatar } from "@/components/Avatar";
import type { TeamPoll } from "./TeamShareThread";

/** Marco que separa una pregunta de los comentarios normales: borde de color, etiqueta «Pregunta» y, si se indica, quién la hizo. */
export function PollFrame({ children, author }: { children: React.ReactNode; author?: { name: string; role?: string | null; date?: string } }) {
  return (
    <div className="space-y-1.5 rounded-xl border-2 border-[#0a6b78]/40 bg-white p-2.5">
      <span className="inline-block rounded-full bg-[#0a6b78] px-2.5 py-0.5 text-[13px] font-semibold uppercase tracking-wide text-white">Pregunta</span>
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

// Pregunta del equipo vista desde adentro: permite responder (a quien tiene
// permisos sobre la tarea) y muestra siempre la estadística — cuántas personas
// eligieron cada opción y quién respondió qué. Cada persona tiene una sola
// respuesta, que puede cambiar hasta que se cierre la pregunta.
export function TeamPollCard({ poll, canVote, canClose }: { poll: TeamPoll; canVote: boolean; canClose: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(poll.myVoteIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = selected.length !== poll.myVoteIds.length || selected.some((id) => !poll.myVoteIds.includes(id));
  const answering = canVote && !poll.closed;

  function toggle(id: string) {
    setSelected((prev) => (poll.multiple ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]));
  }

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[15px] text-slate-500">
        <span>
          {poll.multiple ? "Selección múltiple" : "Selección única"} · {poll.totalVoters} {poll.totalVoters === 1 ? "persona respondió" : "personas respondieron"}
        </span>
        {poll.closed && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">Cerrada</span>}
      </div>

      <ul className="space-y-2">
        {poll.options.map((o) => {
          const pct = poll.totalVoters > 0 ? Math.round((o.voters.length / poll.totalVoters) * 100) : 0;
          return (
            <li key={o.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[17px] text-slate-800">
                {answering ? (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type={poll.multiple ? "checkbox" : "radio"}
                      name={`poll-${poll.id}`}
                      checked={selected.includes(o.id)}
                      onChange={() => toggle(o.id)}
                    />
                    <span className="min-w-0 break-words"><Linkify text={o.label} /></span>
                  </label>
                ) : (
                  <span className="min-w-0 flex-1 break-words">
                    {poll.myVoteIds.includes(o.id) && <span className="mr-1 text-emerald-600">✓</span>}
                    <Linkify text={o.label} />
                  </span>
                )}
                <span className="flex-shrink-0 tabular-nums text-[15px] text-slate-500">
                  {o.voters.length} · {pct}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#0a6b78]" style={{ width: `${pct}%` }} />
              </div>
              {o.voters.length > 0 && (
                <p className="text-[15px] text-slate-500">
                  {o.voters.map((v, i) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      <span className="font-medium text-slate-700">{v.name}</span>
                      {v.role && ` (${v.role})`}
                      {!v.fromTeam && <span className="text-slate-400"> · externo</span>}
                    </span>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="text-[13px] text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {answering && (
          <button
            type="button"
            disabled={busy || selected.length === 0 || !changed}
            onClick={() => run(() => voteSharePoll(poll.id, selected))}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-[15px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {poll.myVoteIds.length > 0 ? "Cambiar mi respuesta" : "Enviar mi respuesta"}
          </button>
        )}
        {canClose && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => setSharePollClosed(poll.id, !poll.closed))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-[15px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {poll.closed ? "Reabrir pregunta" : "Cerrar pregunta"}
          </button>
        )}
      </div>
    </div>
  );
}
