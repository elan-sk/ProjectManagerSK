"use client";

import { createContext, useContext } from "react";
import { CommentForm, type MentionPerson } from "@/components/CommentForm";
import { CommentItem } from "@/components/CommentItem";
import { TeamPollCard, PollFrame } from "./TeamPollCard";
import type { TeamPoll } from "./TeamShareThread";

export type CheckMessage = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  /** Ya formateada en el servidor (misma zona horaria para todos). */
  createdLabel: string;
  createdAtMs: number;
  body: string;
  edited: boolean;
  poll: TeamPoll | null;
};

type Ctx = {
  projectId: string;
  taskId: string;
  currentUserId: string;
  people: MentionPerson[];
  /** Mensajes del hilo de cada prueba, por id de check. */
  threads: Record<string, CheckMessage[]>;
  canVote: boolean;
  canClose: boolean;
};

const CheckThreadsContext = createContext<Ctx | null>(null);

/** Reparte los hilos de las pruebas a cada fila sin pasar props por todo el panel. */
export function CheckThreadsProvider({ children, ...value }: Ctx & { children: React.ReactNode }) {
  return <CheckThreadsContext.Provider value={value}>{children}</CheckThreadsContext.Provider>;
}

// Hilo interno de UNA prueba (Prueba/QA): comentarios con @menciones, imágenes,
// archivos y enlaces, y preguntas de selección única o múltiple con estadística
// de quién respondió qué. Es del equipo: nunca sale por el link compartido.
export function CheckThread({ checkId, title }: { checkId: string; title: string }) {
  const ctx = useContext(CheckThreadsContext);
  if (!ctx) return null;
  const messages = ctx.threads[checkId] ?? [];

  return (
    <details open={messages.length > 0} className="group mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
      <summary className="cursor-pointer select-none text-[17px] font-semibold text-slate-600">
        💬 Comentarios y preguntas · <span className="font-medium">{title}</span>
        {messages.length > 0 && <span className="ml-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-[13px] font-medium text-slate-700">{messages.length}</span>}
      </summary>
      <div className="mt-2 space-y-3">
        {messages.map((m) => {
          const item = (
            <CommentItem
              id={m.id}
              authorId={m.authorId}
              authorName={m.authorName}
              authorAvatarUrl={m.authorAvatarUrl}
              createdLabel={m.createdLabel}
              createdAtMs={m.createdAtMs}
              body={m.body}
              edited={m.edited}
              currentUserId={ctx.currentUserId}
              asQuestion={Boolean(m.poll)}
            />
          );
          return m.poll ? (
            <PollFrame key={m.id}>
              {item}
              <TeamPollCard key={`${m.poll.id}-${m.poll.myVoteIds.join(",")}`} poll={m.poll} canVote={ctx.canVote} canClose={ctx.canClose} />
            </PollFrame>
          ) : (
            <div key={m.id}>{item}</div>
          );
        })}
        <CommentForm projectId={ctx.projectId} taskId={ctx.taskId} people={ctx.people} reviewCheckId={checkId} allowPoll />
      </div>
    </details>
  );
}
