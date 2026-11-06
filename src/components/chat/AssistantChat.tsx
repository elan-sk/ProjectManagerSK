"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { Avatar } from "@/components/Avatar";
import type { ViewFile } from "@/components/FileViewer";
import { ArrowUpIcon, CheckIcon, MicIcon, PaperclipIcon, PauseIcon, ResumeIcon, TrashIcon } from "@/components/icons";
import { PendingActionCard, type ChatUiMessage } from "@/components/chat/ChatMessages";
import { renderMessage } from "@/components/chat/chatMarkdown";
import type { useVoiceRecorder } from "@/components/useVoiceRecorder";
import { fitToContent } from "@/lib/fitToContent";
import { splitUploadNote } from "@/lib/chatUploadNote";

export const SEND_ERROR = "No se pudo procesar el mensaje. Intentarlo de nuevo en un momento.";

type Voice = ReturnType<typeof useVoiceRecorder>;

export function clock(total: number) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function FileChips({ files, openFile }: { files: { name: string; url: string }[]; openFile: (f: ViewFile) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {files.map((f) => (
        <button key={f.url} type="button" onClick={() => openFile(f)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-700 hover:border-[#0a6b78]">
          <PaperclipIcon className="h-4 w-4 text-slate-500" />
          {f.name}
        </button>
      ))}
    </div>
  );
}

type Turn = { kind: "user"; m: ChatUiMessage } | { kind: "assistant"; m: ChatUiMessage } | { kind: "notes"; items: ChatUiMessage[] };

function groupTurns(messages: ChatUiMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      const last = turns[turns.length - 1];
      if (last?.kind === "notes") last.items.push(m);
      else turns.push({ kind: "notes", items: [m] });
    } else turns.push({ kind: m.role, m } as Turn);
  }
  return turns;
}

export function AssistantTurns({
  messages,
  optimisticMessage,
  isPending,
  botName,
  botAvatarUrl,
  openFile,
  onConfirm,
  stepLabel,
  renderAssistantActions,
}: {
  messages: ChatUiMessage[];
  optimisticMessage: ChatUiMessage | null;
  isPending: boolean;
  botName: string;
  botAvatarUrl: string | null;
  openFile: (f: ViewFile) => void;
  onConfirm: (toolUseId: string, decision: "confirm" | "decline") => void;
  stepLabel?: string | null;
  renderAssistantActions?: (m: ChatUiMessage) => ReactNode;
}) {
  const turns = groupTurns(optimisticMessage ? [...messages, optimisticMessage] : messages);
  const lastAssistantIndex = turns.findLastIndex((t) => t.kind === "assistant");
  return (
    <>
      {turns.map((turn, i) => {
        if (turn.kind === "notes") {
          return (
            <ul key={turn.items[0].id} className="space-y-1 sm:pl-12">
              {turn.items.map((n) => {
                const failed = n.text.startsWith("❌") || n.text === SEND_ERROR;
                return (
                  <li key={n.id} className={`flex items-center gap-2 text-sm ${failed ? "text-red-600" : "text-slate-500"}`}>
                    {!failed && <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />}
                    <span>{n.text.replace(/^[✅❌]\s*/, "")}</span>
                  </li>
                );
              })}
            </ul>
          );
        }
        if (turn.kind === "user") {
          const { text: body, files } = splitUploadNote(turn.m.text);
          return (
            <div key={turn.m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-3xl bg-slate-50 px-5 py-3 text-[17px] leading-relaxed text-slate-900">
                {body && <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{body}</div>}
                {files.length > 0 && <FileChips files={files} openFile={openFile} />}
              </div>
            </div>
          );
        }
        return (
          <div key={turn.m.id} className="flex gap-3">
            <span className="hidden shrink-0 sm:block">
              <Avatar name={botName} avatarUrl={botAvatarUrl} size="h-9 w-9 text-xs" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              {i === lastAssistantIndex && stepLabel && <p className="mb-2 hidden text-xs font-semibold tracking-wide text-[#0a6b78] uppercase lg:block">{stepLabel}</p>}
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 text-[17px] leading-[1.7] text-slate-900 [overflow-wrap:anywhere]">{renderMessage(turn.m.text, openFile)}</div>
                {renderAssistantActions?.(turn.m)}
              </div>
              {turn.m.pendingAction && (
                <div className="mt-4">
                  <PendingActionCard action={turn.m.pendingAction} isPending={isPending} onConfirm={onConfirm} large />
                </div>
              )}
            </div>
          </div>
        );
      })}
      {isPending && (
        <div className="flex items-center gap-3" aria-live="polite">
          <Avatar name={botName} avatarUrl={botAvatarUrl} size="h-9 w-9 text-xs shrink-0" />
          <div className="flex items-center gap-1.5" role="status">
            <span className="sr-only">{botName} está escribiendo</span>
            <i aria-hidden="true" className="typing-dot h-2 w-2 rounded-full bg-[#0a6b78] [animation-delay:0ms] motion-reduce:animate-none" />
            <i aria-hidden="true" className="typing-dot h-2 w-2 rounded-full bg-[#0a6b78] [animation-delay:120ms] motion-reduce:animate-none" />
            <i aria-hidden="true" className="typing-dot h-2 w-2 rounded-full bg-[#0a6b78] [animation-delay:240ms] motion-reduce:animate-none" />
          </div>
        </div>
      )}
    </>
  );
}

function RecorderBar({ voice }: { voice: Voice }) {
  const left = voice.maxSeconds - voice.seconds;
  const notice = voice.limitReached
    ? `Se llegó al máximo de ${Math.round(voice.maxSeconds / 60)} minutos. Enviar o eliminar el audio.`
    : voice.state === "recording" && left <= 30
      ? `Quedan ${left} s`
      : voice.state === "paused"
        ? "En pausa"
        : null;

  if (voice.state === "transcribing") {
    return (
      <div className="flex items-center gap-3 px-5 py-5 text-[15px] text-slate-600" role="status" aria-live="polite">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <i className="typing-dot h-2 w-2 rounded-full bg-[#0a6b78] [animation-delay:0ms] motion-reduce:animate-none" />
          <i className="typing-dot h-2 w-2 rounded-full bg-[#0a6b78] [animation-delay:120ms] motion-reduce:animate-none" />
          <i className="typing-dot h-2 w-2 rounded-full bg-[#0a6b78] [animation-delay:240ms] motion-reduce:animate-none" />
        </span>
        Transcribiendo el audio…
      </div>
    );
  }

  const bars = Array.from({ length: 40 }, (_, i) => voice.levels[voice.levels.length - 40 + i] ?? 0);
  return (
    <div className="px-3 py-3">
      {notice && (
        <p className={`px-2 pb-2 text-sm ${voice.limitReached || left <= 30 ? "text-amber-700" : "text-slate-500"}`} aria-live="polite">
          {notice}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={voice.cancel} aria-label="Eliminar el audio" title="Eliminar el audio" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-50 hover:text-red-600">
          <TrashIcon className="h-5 w-5" />
        </button>
        <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${voice.state === "recording" ? "bg-red-600" : "bg-slate-300"}`} />
        <span className="w-12 shrink-0 font-mono text-[15px] text-slate-700 tabular-nums" aria-label={`Duración ${clock(voice.seconds)}`}>
          {clock(voice.seconds)}
        </span>
        <div className="flex h-8 min-w-0 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden="true">
          {bars.map((level, i) => (
            <span key={i} className={`w-[3px] shrink-0 rounded-full ${voice.state === "recording" ? "bg-slate-500" : "bg-slate-300"}`} style={{ height: `${Math.max(12, level * 100)}%` }} />
          ))}
        </div>
        {voice.state === "recording" ? (
          <button type="button" onClick={voice.pause} aria-label="Pausar" title="Pausar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-red-600 hover:bg-red-50">
            <PauseIcon className="h-5 w-5" />
          </button>
        ) : (
          <button type="button" onClick={voice.resume} disabled={voice.limitReached} aria-label="Seguir grabando" title="Seguir grabando" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-red-600 hover:bg-red-50 disabled:opacity-40">
            <ResumeIcon className="h-5 w-5" />
          </button>
        )}
        <button type="button" onClick={voice.send} aria-label="Enviar el audio" title="Enviar el audio" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#073b4c] text-white hover:bg-[#0a6b78]">
          <ArrowUpIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export function AssistantComposer({
  text,
  setText,
  onSend,
  canWrite,
  hasAttachments,
  openPicker,
  fileInput,
  chips,
  voice,
  placeholder,
  blockedNotice,
}: {
  text: string;
  setText: (v: string) => void;
  onSend: () => void;
  canWrite: boolean;
  hasAttachments: boolean;
  openPicker: () => void;
  fileInput: ReactNode;
  chips: ReactNode;
  voice: Voice;
  placeholder: string;
  blockedNotice?: string | null;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => fitToContent(textRef.current), [text]);

  if (blockedNotice) return <p className="py-3 text-center text-[15px] text-slate-500">{blockedNotice}</p>;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(7,59,76,0.13)] focus-within:border-[#0a6b78] focus-within:ring-[3px] focus-within:ring-[#0a6b78]/20">
      {voice.state !== "idle" ? (
        <RecorderBar voice={voice} />
      ) : (
        <>
          {voice.error && (
            <p className="px-5 pt-3 text-sm text-red-600" aria-live="polite">
              {voice.error}
            </p>
          )}
          {chips && <div className="px-4 pt-3">{chips}</div>}
          <textarea
            ref={textRef}
            rows={1}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={placeholder}
            disabled={!canWrite}
            className="block max-h-56 min-h-[3.25rem] w-full resize-none overflow-y-auto border-0 bg-transparent px-5 pt-4 pb-1 text-[17px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:ring-0 focus-visible:outline-none! disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            <div className="flex items-center gap-1">
              <button type="button" onClick={openPicker} disabled={!canWrite} title="Subir un archivo" aria-label="Subir un archivo" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50">
                <PaperclipIcon className="h-5 w-5" />
              </button>
              {fileInput}
              {voice.supported && (
                <button type="button" onClick={() => void voice.start()} disabled={!canWrite} aria-label="Grabar un audio" title="Grabar un audio" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50">
                  <MicIcon className="h-5 w-5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onSend}
              disabled={!canWrite || (!text.trim() && !hasAttachments)}
              aria-label="Enviar"
              title="Enviar"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#073b4c] text-white hover:bg-[#0a6b78] disabled:bg-slate-200 disabled:text-slate-400"
            >
              <ArrowUpIcon className="h-5 w-5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function useStickToBottom(scrollRef: RefObject<HTMLDivElement | null>, changeKey: string, observeKey: string) {
  const stick = useRef(true);

  useEffect(() => {
    stick.current = true;
    const el = scrollRef.current;
    if (el && changeKey) el.scrollTop = el.scrollHeight;
  }, [scrollRef, changeKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !observeKey || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [scrollRef, observeKey]);

  return (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
}
