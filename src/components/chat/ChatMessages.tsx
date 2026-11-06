"use client";

import type { ReactNode } from "react";
import type { ViewFile } from "@/components/FileViewer";
import { renderMessage } from "@/components/chat/chatMarkdown";
import { splitUploadNote } from "@/lib/chatUploadNote";

export type ChatUiMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  pendingAction?: { toolUseId: string; label: string; destructive: boolean };
};

type Props = {
  messages: ChatUiMessage[];
  optimisticMessage: ChatUiMessage | null;
  isPending: boolean;
  botName: string;
  openFile: (f: ViewFile) => void;
  onConfirm: (toolUseId: string, decision: "confirm" | "decline") => void;
  renderAssistantActions?: (m: ChatUiMessage) => ReactNode;
  systemClassName?: string;
};

export function ChatMessages({ messages, optimisticMessage, isPending, botName, openFile, onConfirm, renderAssistantActions, systemClassName = "text-center text-xs text-slate-400" }: Props) {
  return (
    <>
      {messages.map((m) => {
        if (m.role === "system") {
          return (
            <p key={m.id} className={systemClassName}>
              {m.text}
            </p>
          );
        }
        const { text, files } = m.role === "user" ? splitUploadNote(m.text) : { text: m.text, files: [] };
        return (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"}`}>
              <div className="flex items-start gap-1.5">
                <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {text && renderMessage(text, openFile)}
                  {files.length > 0 && (
                    <div className={`flex flex-wrap gap-1 ${text ? "mt-1.5" : ""}`}>
                      {files.map((f) => (
                        <button key={f.url} type="button" onClick={() => openFile(f)} className="rounded-full bg-white/15 px-2 py-0.5 text-xs underline-offset-2 hover:underline">
                          📎 {f.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {m.role === "assistant" && renderAssistantActions?.(m)}
              </div>
              {m.pendingAction && <PendingActionCard action={m.pendingAction} isPending={isPending} onConfirm={onConfirm} />}
            </div>
          </div>
        );
      })}
      {optimisticMessage && (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-3 py-2 text-sm text-white">
            <span className="whitespace-pre-wrap">{optimisticMessage.text}</span>
          </div>
        </div>
      )}
      {isPending && (
        <div className="flex justify-start" aria-live="polite" aria-label={`${botName} está procesando tu mensaje`}>
          <div className="flex h-8 items-center gap-1 rounded-2xl bg-slate-100 px-3" role="status">
            <span className="sr-only">{botName} está escribiendo</span>
            <i aria-hidden="true" className="typing-dot h-1.5 w-1.5 rounded-full bg-[#0a6b78] [animation-delay:0ms] motion-reduce:animate-none" />
            <i aria-hidden="true" className="typing-dot h-1.5 w-1.5 rounded-full bg-[#0a6b78] [animation-delay:120ms] motion-reduce:animate-none" />
            <i aria-hidden="true" className="typing-dot h-1.5 w-1.5 rounded-full bg-[#0a6b78] [animation-delay:240ms] motion-reduce:animate-none" />
          </div>
        </div>
      )}
    </>
  );
}

export function PendingActionCard({
  action,
  isPending,
  onConfirm,
  large = false,
}: {
  action: NonNullable<ChatUiMessage["pendingAction"]>;
  isPending: boolean;
  onConfirm: (toolUseId: string, decision: "confirm" | "decline") => void;
  large?: boolean;
}) {
  const text = large ? "text-[15px]" : "text-xs";
  const button = large ? "rounded-lg px-4 py-2 text-sm font-semibold" : "rounded-lg px-2.5 py-1 text-xs font-medium";
  return (
    <div className={`mt-2 space-y-1.5 rounded-lg border text-slate-800 ${large ? "space-y-3 rounded-2xl p-4 shadow-[0_12px_32px_rgba(7,59,76,0.13)]" : "p-2"} ${action.destructive ? "border-red-200 bg-red-50" : large ? "border-slate-100 bg-white" : "border-transparent bg-white"}`}>
      <p className={`whitespace-pre-line font-medium [overflow-wrap:anywhere] ${text} ${action.destructive ? "text-red-700" : ""}`}>{action.label}</p>
      {action.destructive && <p className="text-[11px] text-red-600">Esta acción no se puede deshacer — confirmá con cuidado.</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => onConfirm(action.toolUseId, "decline")}
          className={`border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60 ${button} ${large ? "" : "order-2"}`}
        >
          No, cancelar
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => onConfirm(action.toolUseId, "confirm")}
          className={`text-white disabled:opacity-60 ${button} ${large ? "" : "order-1"} ${action.destructive ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-800"}`}
        >
          {action.destructive ? "Sí, eliminar" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
